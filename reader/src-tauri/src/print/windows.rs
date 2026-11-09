//! Win32 printing: printers, DEVMODE settings, printable area, the driver's
//! properties dialog and GDI print jobs drawn by PDFium.

use std::path::Path;

use pdfium_render::prelude::PdfiumLibraryBindingsAccessor;
use windows::core::{w, PCWSTR, PWSTR};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::{
    CreateDCW, DeleteDC, GetDeviceCaps, DEVMODEW, DEVMODE_FIELD_FLAGS, DMCOLLATE_FALSE,
    DMCOLLATE_TRUE, DMCOLOR_COLOR, DMCOLOR_MONOCHROME, DMDUP_HORIZONTAL, DMDUP_SIMPLEX,
    DMDUP_VERTICAL, DMORIENT_LANDSCAPE, DMORIENT_PORTRAIT, DM_COLLATE, DM_COLOR, DM_COPIES,
    DM_DUPLEX, DM_FORMNAME, DM_IN_BUFFER, DM_IN_PROMPT, DM_ORIENTATION, DM_OUT_BUFFER,
    DM_PAPERLENGTH, DM_PAPERSIZE, DM_PAPERWIDTH, HDC, HORZRES, LOGPIXELSX, LOGPIXELSY,
    PHYSICALHEIGHT, PHYSICALOFFSETX, PHYSICALOFFSETY, PHYSICALWIDTH, VERTRES,
};
use windows::Win32::Graphics::Printing::{
    ClosePrinter, DocumentPropertiesW, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW,
    PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_4W,
};
use windows::Win32::Storage::Xps::{
    AbortDoc, DeviceCapabilitiesW, EndDoc, EndPage, StartDocW, StartPage, DC_COLLATE,
    DC_COLORDEVICE, DC_COPIES, DC_DUPLEX, DC_PAPERNAMES, DC_PAPERS, DC_PAPERSIZE, DOCINFOW,
    PRINTER_DEVICE_CAPABILITIES,
};

use super::{
    DeviceSettings, Duplex, PageArea, PaperInfo, PrintJob, PrinterCapabilities, PrinterInfo,
    PropertiesResult,
};

// PDFium render flags (fpdfview.h).
const FPDF_ANNOT: i32 = 0x01;
const FPDF_GRAYSCALE: i32 = 0x08;
const FPDF_PRINTING: i32 = 0x800;

/// `IDOK` from `DocumentPropertiesW` with `DM_IN_PROMPT`.
const IDOK: i32 = 1;

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide(value: &[u16]) -> String {
    let end = value
        .iter()
        .position(|&unit| unit == 0)
        .unwrap_or(value.len());
    String::from_utf16_lossy(&value[..end])
}

// ---- printers ----

fn default_printer() -> Option<String> {
    let mut length = 0u32;
    // SAFETY: a null buffer asks for the required length.
    unsafe {
        let _ = GetDefaultPrinterW(None, &mut length);
    }
    if length == 0 {
        return None;
    }
    let mut buffer = vec![0u16; length as usize];
    // SAFETY: `buffer` holds `length` UTF-16 units.
    let found = unsafe { GetDefaultPrinterW(Some(PWSTR(buffer.as_mut_ptr())), &mut length) };
    found.as_bool().then(|| from_wide(&buffer))
}

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut count = 0u32;
    // SAFETY: the first call only reports the buffer size.
    unsafe {
        let _ = EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut needed, &mut count);
    }
    if needed == 0 {
        return Ok(Vec::new());
    }
    // u64 storage keeps the PRINTER_INFO_4W records pointer-aligned.
    let mut storage = vec![0u64; (needed as usize).div_ceil(8)];
    // SAFETY: the byte view covers exactly the u64 storage.
    let bytes = unsafe {
        std::slice::from_raw_parts_mut(storage.as_mut_ptr().cast::<u8>(), needed as usize)
    };
    unsafe {
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            4,
            Some(bytes),
            &mut needed,
            &mut count,
        )
    }
    .map_err(|error| format!("列出打印机失败：{error}"))?;
    // SAFETY: EnumPrintersW wrote `count` records at the start of the buffer.
    let records = unsafe {
        std::slice::from_raw_parts(storage.as_ptr().cast::<PRINTER_INFO_4W>(), count as usize)
    };
    let default = default_printer();
    let mut printers: Vec<PrinterInfo> = records
        .iter()
        .filter(|record| !record.pPrinterName.is_null())
        .map(|record| {
            // SAFETY: a non-null name in a record EnumPrintersW returned.
            let name = unsafe { record.pPrinterName.to_string() }.unwrap_or_default();
            PrinterInfo {
                is_default: default.as_deref() == Some(name.as_str()),
                name,
            }
        })
        .filter(|printer| !printer.name.is_empty())
        .collect();
    printers.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(printers)
}

struct Printer {
    handle: PRINTER_HANDLE,
    name: Vec<u16>,
}

impl Printer {
    fn open(name: &str) -> Result<Self, String> {
        let name = wide(name);
        let mut handle = PRINTER_HANDLE::default();
        // SAFETY: `name` is NUL-terminated and outlives the call.
        unsafe { OpenPrinterW(PCWSTR(name.as_ptr()), &mut handle, None) }
            .map_err(|error| format!("打开打印机失败：{error}"))?;
        Ok(Self { handle, name })
    }

    fn name(&self) -> PCWSTR {
        PCWSTR(self.name.as_ptr())
    }

    /// The printer's DEVMODE, starting from `input` when it is one of this
    /// printer's, with `settings` applied and validated by the driver.
    fn devmode(
        &self,
        input: Option<&[u8]>,
        settings: Option<&DeviceSettings>,
    ) -> Result<DevMode, String> {
        // SAFETY: mode 0 with no buffers returns the DEVMODE size.
        let size = unsafe { DocumentPropertiesW(None, self.handle, self.name(), None, None, 0) };
        if size <= 0 {
            return Err("读取打印机设置失败".into());
        }
        let mut current = DevMode::new(size as usize);
        let input = input
            .and_then(DevMode::from_bytes)
            .filter(|candidate| candidate.device_name() == from_wide(&self.name));
        self.merge(&mut current, input.as_ref())?;
        if let Some(settings) = settings {
            let mut wanted = current.clone();
            wanted.apply(settings);
            self.merge(&mut current, Some(&wanted))?;
        }
        Ok(current)
    }

    fn merge(&self, output: &mut DevMode, input: Option<&DevMode>) -> Result<(), String> {
        let mode = if input.is_some() {
            DM_IN_BUFFER.0 | DM_OUT_BUFFER.0
        } else {
            DM_OUT_BUFFER.0
        };
        // SAFETY: `output` holds the size the driver reported; `input`, if
        // any, is a complete DEVMODE (checked in `DevMode::from_bytes`).
        let result = unsafe {
            DocumentPropertiesW(
                None,
                self.handle,
                self.name(),
                Some(output.as_mut_ptr()),
                input.map(|devmode| devmode.as_ptr()),
                mode,
            )
        };
        if result < 0 {
            return Err("打印机拒绝了这些设置".into());
        }
        Ok(())
    }
}

impl Drop for Printer {
    fn drop(&mut self) {
        // SAFETY: the handle came from OpenPrinterW and is closed once.
        unsafe {
            let _ = ClosePrinter(self.handle);
        }
    }
}

/// A DEVMODE with its driver-private tail, kept DEVMODEW-aligned.
#[derive(Clone)]
struct DevMode {
    storage: Vec<u64>,
    len: usize,
}

impl DevMode {
    fn new(len: usize) -> Self {
        let len = len.max(std::mem::size_of::<DEVMODEW>());
        Self {
            storage: vec![0; len.div_ceil(8)],
            len,
        }
    }

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < std::mem::size_of::<DEVMODEW>() {
            return None;
        }
        let mut devmode = Self::new(bytes.len());
        devmode.bytes_mut()[..bytes.len()].copy_from_slice(bytes);
        let header = devmode.get();
        let total = header.dmSize as usize + header.dmDriverExtra as usize;
        (header.dmSize as usize >= 68 && total <= bytes.len()).then_some(devmode)
    }

    fn bytes_mut(&mut self) -> &mut [u8] {
        // SAFETY: the byte view stays inside `storage`.
        unsafe { std::slice::from_raw_parts_mut(self.storage.as_mut_ptr().cast::<u8>(), self.len) }
    }

    fn to_bytes(&self) -> Vec<u8> {
        let header = self.get();
        let total = (header.dmSize as usize + header.dmDriverExtra as usize).min(self.len);
        // SAFETY: the byte view stays inside `storage`.
        unsafe { std::slice::from_raw_parts(self.storage.as_ptr().cast::<u8>(), total) }.to_vec()
    }

    fn as_ptr(&self) -> *const DEVMODEW {
        self.storage.as_ptr().cast()
    }

    fn as_mut_ptr(&mut self) -> *mut DEVMODEW {
        self.storage.as_mut_ptr().cast()
    }

    fn get(&self) -> &DEVMODEW {
        // SAFETY: storage is at least one aligned DEVMODEW.
        unsafe { &*self.as_ptr() }
    }

    fn get_mut(&mut self) -> &mut DEVMODEW {
        // SAFETY: storage is at least one aligned DEVMODEW.
        unsafe { &mut *self.as_mut_ptr() }
    }

    fn device_name(&self) -> String {
        from_wide(&self.get().dmDeviceName)
    }

    fn has(&self, field: DEVMODE_FIELD_FLAGS) -> bool {
        self.get().dmFields.0 & field.0 != 0
    }

    fn apply(&mut self, settings: &DeviceSettings) {
        let devmode = self.get_mut();
        let mut fields = devmode.dmFields.0;
        // SAFETY: printer DEVMODEs use the paper/orientation union arm.
        let paper = unsafe { &mut devmode.Anonymous1.Anonymous1 };
        if let Some(id) = settings.paper_id {
            paper.dmPaperSize = id;
            fields |= DM_PAPERSIZE.0;
            // A form name or custom size would override the paper id.
            fields &= !(DM_PAPERLENGTH.0 | DM_PAPERWIDTH.0 | DM_FORMNAME.0);
        }
        paper.dmOrientation = if settings.landscape {
            DMORIENT_LANDSCAPE as i16
        } else {
            DMORIENT_PORTRAIT as i16
        };
        paper.dmCopies = settings.copies.clamp(1, i16::MAX as u32) as i16;
        devmode.dmDuplex = match settings.duplex {
            Duplex::None => DMDUP_SIMPLEX,
            Duplex::Long => DMDUP_VERTICAL,
            Duplex::Short => DMDUP_HORIZONTAL,
        };
        devmode.dmColor = if settings.color {
            DMCOLOR_COLOR
        } else {
            DMCOLOR_MONOCHROME
        };
        devmode.dmCollate = if settings.collate {
            DMCOLLATE_TRUE
        } else {
            DMCOLLATE_FALSE
        };
        fields |= DM_ORIENTATION.0 | DM_COPIES.0 | DM_DUPLEX.0 | DM_COLOR.0 | DM_COLLATE.0;
        devmode.dmFields = DEVMODE_FIELD_FLAGS(fields);
    }

    fn settings(&self) -> DeviceSettings {
        let devmode = self.get();
        // SAFETY: printer DEVMODEs use the paper/orientation union arm.
        let paper = unsafe { devmode.Anonymous1.Anonymous1 };
        DeviceSettings {
            paper_id: (self.has(DM_PAPERSIZE) && paper.dmPaperSize > 0)
                .then_some(paper.dmPaperSize),
            landscape: self.has(DM_ORIENTATION) && paper.dmOrientation == DMORIENT_LANDSCAPE as i16,
            duplex: if !self.has(DM_DUPLEX) {
                Duplex::None
            } else if devmode.dmDuplex == DMDUP_VERTICAL {
                Duplex::Long
            } else if devmode.dmDuplex == DMDUP_HORIZONTAL {
                Duplex::Short
            } else {
                Duplex::None
            },
            color: !self.has(DM_COLOR) || devmode.dmColor != DMCOLOR_MONOCHROME,
            copies: if self.has(DM_COPIES) {
                paper.dmCopies.max(1) as u32
            } else {
                1
            },
            collate: self.has(DM_COLLATE) && devmode.dmCollate == DMCOLLATE_TRUE,
        }
    }
}

// ---- capabilities ----

fn device_capability(
    printer: &Printer,
    capability: PRINTER_DEVICE_CAPABILITIES,
    output: Option<PWSTR>,
    devmode: &DevMode,
) -> i32 {
    // SAFETY: callers size `output` from a prior call without a buffer.
    unsafe {
        DeviceCapabilitiesW(
            printer.name(),
            PCWSTR::null(),
            capability,
            output,
            Some(devmode.as_ptr()),
        )
    }
}

pub fn capabilities(name: &str, devmode: Option<&[u8]>) -> Result<PrinterCapabilities, String> {
    let printer = Printer::open(name)?;
    let devmode = printer.devmode(devmode, None)?;

    let count = device_capability(&printer, DC_PAPERS, None, &devmode).max(0) as usize;
    let mut ids = vec![0u16; count];
    let mut names = vec![0u16; count * 64];
    let mut sizes = vec![POINT::default(); count];
    if count > 0 {
        device_capability(&printer, DC_PAPERS, Some(PWSTR(ids.as_mut_ptr())), &devmode);
        device_capability(
            &printer,
            DC_PAPERNAMES,
            Some(PWSTR(names.as_mut_ptr())),
            &devmode,
        );
        device_capability(
            &printer,
            DC_PAPERSIZE,
            Some(PWSTR(sizes.as_mut_ptr().cast())),
            &devmode,
        );
    }
    let mut papers: Vec<PaperInfo> = Vec::with_capacity(count);
    for index in 0..count {
        let id = ids[index] as i16;
        let size = sizes[index];
        if id <= 0 || size.x <= 0 || size.y <= 0 || papers.iter().any(|paper| paper.id == id) {
            continue;
        }
        let name = from_wide(&names[index * 64..(index + 1) * 64]);
        papers.push(PaperInfo {
            id,
            name: if name.is_empty() {
                format!("纸张 {id}")
            } else {
                name
            },
            width_mm: size.x as f64 / 10.0,
            height_mm: size.y as f64 / 10.0,
        });
    }

    Ok(PrinterCapabilities {
        papers,
        duplex: device_capability(&printer, DC_DUPLEX, None, &devmode) == 1,
        color: device_capability(&printer, DC_COLORDEVICE, None, &devmode) == 1,
        collate: device_capability(&printer, DC_COLLATE, None, &devmode) == 1,
        max_copies: device_capability(&printer, DC_COPIES, None, &devmode).max(1) as u32,
        defaults: devmode.settings(),
    })
}

// ---- device contexts ----

struct PrinterDc(HDC);

impl PrinterDc {
    fn create(printer: &Printer, devmode: &DevMode) -> Result<Self, String> {
        // SAFETY: the printer name and DEVMODE outlive the call.
        let dc = unsafe {
            CreateDCW(
                w!("WINSPOOL"),
                printer.name(),
                PCWSTR::null(),
                Some(devmode.as_ptr()),
            )
        };
        if dc.is_invalid() {
            return Err("无法连接打印机".into());
        }
        Ok(Self(dc))
    }

    fn caps(&self, index: windows::Win32::Graphics::Gdi::GET_DEVICE_CAPS_INDEX) -> f64 {
        // SAFETY: a live DC.
        unsafe { GetDeviceCaps(Some(self.0), index) as f64 }
    }

    /// Dots per millimetre, horizontally and vertically.
    fn dots_per_mm(&self) -> (f64, f64) {
        (
            self.caps(LOGPIXELSX).max(1.0) / 25.4,
            self.caps(LOGPIXELSY).max(1.0) / 25.4,
        )
    }
}

impl Drop for PrinterDc {
    fn drop(&mut self) {
        // SAFETY: the DC came from CreateDCW and is deleted once.
        unsafe {
            let _ = DeleteDC(self.0);
        }
    }
}

pub fn page_area(
    name: &str,
    devmode: Option<&[u8]>,
    paper_id: Option<i16>,
    landscape: bool,
) -> Result<PageArea, String> {
    let printer = Printer::open(name)?;
    let mut settings = printer.devmode(devmode, None)?.settings();
    settings.paper_id = paper_id.or(settings.paper_id);
    settings.landscape = landscape;
    let devmode = printer.devmode(devmode, Some(&settings))?;
    let dc = PrinterDc::create(&printer, &devmode)?;
    let (x, y) = dc.dots_per_mm();
    Ok(PageArea {
        paper_width_mm: dc.caps(PHYSICALWIDTH) / x,
        paper_height_mm: dc.caps(PHYSICALHEIGHT) / y,
        printable_left_mm: dc.caps(PHYSICALOFFSETX) / x,
        printable_top_mm: dc.caps(PHYSICALOFFSETY) / y,
        printable_width_mm: dc.caps(HORZRES) / x,
        printable_height_mm: dc.caps(VERTRES) / y,
    })
}

pub fn properties(
    hwnd: isize,
    name: &str,
    devmode: Option<&[u8]>,
    settings: &DeviceSettings,
) -> Result<Option<PropertiesResult>, String> {
    let printer = Printer::open(name)?;
    let input = printer.devmode(devmode, Some(settings))?;
    let mut output = input.clone();
    // SAFETY: both buffers are complete DEVMODEs of this printer; the owner
    // window belongs to this (UI) thread.
    let result = unsafe {
        DocumentPropertiesW(
            Some(HWND(hwnd as *mut _)),
            printer.handle,
            printer.name(),
            Some(output.as_mut_ptr()),
            Some(input.as_ptr()),
            DM_IN_BUFFER.0 | DM_IN_PROMPT.0 | DM_OUT_BUFFER.0,
        )
    };
    if result < 0 {
        return Err("无法打开打印机属性".into());
    }
    if result != IDOK {
        return Ok(None);
    }
    Ok(Some(PropertiesResult {
        settings: output.settings(),
        devmode: output.to_bytes(),
    }))
}

// ---- print job ----

/// Ends an unfinished GDI document if printing stops part-way.
struct GdiDocument<'a> {
    dc: &'a PrinterDc,
    finished: bool,
}

impl Drop for GdiDocument<'_> {
    fn drop(&mut self) {
        if !self.finished {
            // SAFETY: a document was started on this DC.
            unsafe {
                AbortDoc(self.dc.0);
            }
        }
    }
}

pub fn print(snapshot: &Path, job: &PrintJob) -> Result<(), String> {
    let printer = Printer::open(&job.printer)?;
    let devmode = printer.devmode(job.devmode.as_deref(), Some(&job.settings))?;
    let dc = PrinterDc::create(&printer, &devmode)?;
    let (dots_x, dots_y) = dc.dots_per_mm();
    let offset_x = dc.caps(PHYSICALOFFSETX);
    let offset_y = dc.caps(PHYSICALOFFSETY);

    let bindings = crate::pdf::pdfium::pdfium().bindings();
    let path = snapshot.to_string_lossy();
    // SAFETY: PDFium calls happen under the caller's PDFium lock.
    let document = unsafe { bindings.FPDF_LoadDocument(&path, None) };
    if document.is_null() {
        return Err("无法读取要打印的文档".into());
    }
    // SAFETY: a loaded document.
    let page_count = unsafe { bindings.FPDF_GetPageCount(document) }.max(0) as u32;

    let mut flags = FPDF_PRINTING;
    if job.annotations {
        flags |= FPDF_ANNOT;
    }
    if !job.settings.color {
        flags |= FPDF_GRAYSCALE;
    }

    let title = wide(if job.title.is_empty() {
        "Reader"
    } else {
        &job.title
    });
    let info = DOCINFOW {
        cbSize: std::mem::size_of::<DOCINFOW>() as i32,
        lpszDocName: PCWSTR(title.as_ptr()),
        ..Default::default()
    };
    let result = (|| {
        // SAFETY: `info` and its title outlive the call.
        if unsafe { StartDocW(dc.0, &info) } <= 0 {
            return Err("打印已取消或打印机不可用".to_string());
        }
        let mut gdi = GdiDocument {
            dc: &dc,
            finished: false,
        };
        for sheet in &job.sheets {
            // SAFETY: a started document on a live DC.
            if unsafe { StartPage(dc.0) } <= 0 {
                return Err("打印机拒绝了新的一页".into());
            }
            for placement in sheet {
                if placement.page >= page_count {
                    continue;
                }
                // SAFETY: an index below the page count of a loaded document.
                let page = unsafe { bindings.FPDF_LoadPage(document, placement.page as i32) };
                if page.is_null() {
                    continue;
                }
                let left = (placement.x * dots_x - offset_x).round() as i32;
                let top = (placement.y * dots_y - offset_y).round() as i32;
                let width = (placement.width * dots_x).round().max(1.0) as i32;
                let height = (placement.height * dots_y).round().max(1.0) as i32;
                // SAFETY: a page of the loaded document drawn into the
                // printer DC between StartPage and EndPage.
                unsafe {
                    bindings.FPDF_RenderPage(
                        dc.0,
                        page,
                        left,
                        top,
                        width,
                        height,
                        i32::from(placement.rotate % 4),
                        flags,
                    );
                    bindings.FPDF_ClosePage(page);
                }
            }
            // SAFETY: closes the page started above.
            if unsafe { EndPage(dc.0) } <= 0 {
                return Err("打印机拒绝了这一页".into());
            }
        }
        // SAFETY: ends the document started above.
        if unsafe { EndDoc(dc.0) } <= 0 {
            return Err("打印任务没能交给打印机".into());
        }
        gdi.finished = true;
        Ok(())
    })();
    // SAFETY: closes the document loaded above, after its last page.
    unsafe { bindings.FPDF_CloseDocument(document) };
    result
}
