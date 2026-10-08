$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $root '../../..')).Path
$manifest = Get-Content (Join-Path $root 'sources.json') -Raw | ConvertFrom-Json
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('reader-icon-options-' + [guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $temporary
$images = @{}
$report = @()
foreach ($set in $manifest) {
    foreach ($file in $set.Files) {
        $source = Join-Path $root $file.Path
        if ((Get-FileHash $source).Hash -ne $file.SHA256) { throw "Source mismatch: $($file.Path)" }
        if ($file.Type -notin @('Pdf', 'Markdown')) { continue }
        [xml]$xml = Get-Content $source -Raw
        if ($xml.SelectNodes('//*[local-name()="script" or local-name()="foreignObject" or local-name()="image"]').Count) { throw 'Unexpected active or external SVG content' }
        $svg = $xml.DocumentElement
        $svg.SetAttribute('x', '4'); $svg.SetAttribute('y', '4')
        $svg.SetAttribute('width', '120'); $svg.SetAttribute('height', '120')
        $color = if ($file.Type -eq 'Pdf') { '#ba4f4f' } else { '#536b89' }
        $wrapper = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="' + $color + '" color="' + $color + '">' + $svg.OuterXml + '</svg>'
        $key = $set.ID + '-' + $file.Type.ToLower()
        $inputPath = Join-Path $temporary ($key + '.svg')
        [IO.File]::WriteAllText($inputPath, $wrapper)
        $outputPath = Join-Path $temporary $key
        $cli = Join-Path $repo 'reader/node_modules/@tauri-apps/cli/tauri.js'
        & node $cli icon $inputPath --output $outputPath *> $null
        if ($LASTEXITCODE -ne 0) { throw "SVG render failed: $key" }
        $bitmap = [Drawing.Bitmap]::new((Join-Path $outputPath '128x128.png'))
        $images[$key] = $bitmap
        $report += [pscustomobject]@{ ID=$set.ID; Type=$file.Type; Width=$bitmap.Width; Height=$bitmap.Height; SHA256=$file.SHA256 }
    }
}
$canvas = [Drawing.Bitmap]::new(1160, 820)
$g = [Drawing.Graphics]::FromImage($canvas)
$g.Clear([Drawing.ColorTranslator]::FromHtml('#edf0f3'))
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$titleFont = [Drawing.Font]::new('Segoe UI', 18, [Drawing.FontStyle]::Bold)
$labelFont = [Drawing.Font]::new('Segoe UI', 10)
$headingFont = [Drawing.Font]::new('Segoe UI', 20, [Drawing.FontStyle]::Bold)
$darkText = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#25303e'))
$lightText = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#d9e1ea'))
$g.DrawString('PDF / Markdown — existing icon sets', $headingFont, $darkText, 26, 14)
$g.DrawString('Original shapes. Each panel: PDF on the left, Markdown on the right. 96 / 32 / 24 px.', $labelFont, $darkText, 28, 54)
for ($i=0; $i -lt $manifest.Count; $i++) {
    $set = $manifest[$i]
    $x = 24 + ($i % 2) * 570
    $y = 90 + [math]::Floor($i / 2) * 350
    $g.DrawString(($set.ID + '  ' + $set.Name), $titleFont, $darkText, $x, $y)
    for ($theme=0; $theme -lt 2; $theme++) {
        $px = $x + $theme * 270
        $py = $y + 42
        $bg = if ($theme -eq 0) { '#ffffff' } else { '#253444' }
        $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($bg))
        $g.FillRectangle($brush, $px, $py, 258, 272)
        $brush.Dispose()
        $textBrush = if ($theme -eq 0) { $darkText } else { $lightText }
        $g.DrawString('PDF', $labelFont, $textBrush, $px+53, $py+14)
        $g.DrawString('MD', $labelFont, $textBrush, $px+175, $py+14)
        foreach ($type in @('pdf','markdown')) {
            $column = if ($type -eq 'pdf') { 0 } else { 1 }
            $cx = $px + 64 + $column * 126
            $bitmap = $images[$set.ID + '-' + $type]
            $g.DrawImage($bitmap, [Drawing.Rectangle]::new($cx-48, $py+47, 96, 96))
            $g.DrawImage($bitmap, [Drawing.Rectangle]::new($cx-16, $py+167, 32, 32))
            $g.DrawImage($bitmap, [Drawing.Rectangle]::new($cx-12, $py+222, 24, 24))
        }
    }
}
$g.DrawString('A/B: original colors. C/D: monochrome originals previewed in PDF red / MD blue.', $labelFont, $darkText, 28, 793)
$canvas.Save((Join-Path $root 'comparison.png'), [Drawing.Imaging.ImageFormat]::Png)
$report | ConvertTo-Json | Set-Content (Join-Path $root 'verification.json') -Encoding utf8
foreach ($bitmap in $images.Values) { $bitmap.Dispose() }
$g.Dispose(); $canvas.Dispose()
$titleFont.Dispose(); $labelFont.Dispose(); $headingFont.Dispose()
$darkText.Dispose(); $lightText.Dispose()
Write-Output "Rendered all eight original SVGs. Preview: $root/comparison.png"
