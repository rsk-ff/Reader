[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$errors = [System.Collections.Generic.List[string]]::new()
$repoPrefix = $repoRoot.TrimEnd([char[]]"\/") + [IO.Path]::DirectorySeparatorChar

function Get-MarkdownAnchors {
    param([string]$Path)

    $anchors = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $counts = @{}

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^#{1,6}\s+(?<heading>.+?)\s*#*\s*$') {
            continue
        }

        $slug = $Matches["heading"].ToLowerInvariant()
        $slug = [regex]::Replace($slug, '[^\p{L}\p{N}\s_-]', '')
        $slug = [regex]::Replace($slug.Trim(), '\s+', '-')

        if ($counts.ContainsKey($slug)) {
            $counts[$slug] += 1
            $slug = "$slug-$($counts[$slug])"
        }
        else {
            $counts[$slug] = 0
        }

        [void]$anchors.Add($slug)
    }

    return ,$anchors
}

$requiredFiles = @(
    "AGENTS.md",
    "README.md",
    "CHANGELOG.md",
    "docs/PRODUCT.md",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPMENT.md",
    "docs/STATUS.md",
    "CLAUDE.md",
    "docs/decisions/README.md",
    "docs/tasks/TEMPLATE.md"
)

foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath))) {
        $errors.Add("Missing required document: $relativePath")
    }
}

$managedFiles = @(
    Get-Item -LiteralPath (Join-Path $repoRoot "AGENTS.md")
    Get-Item -LiteralPath (Join-Path $repoRoot "README.md")
    Get-Item -LiteralPath (Join-Path $repoRoot "CHANGELOG.md")
    Get-Item -LiteralPath (Join-Path $repoRoot "reader/README.md")
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "docs") -Recurse -File -Filter "*.md"
) | Sort-Object -Property FullName -Unique

$linkPattern = '(?<!!)\[[^\]]+\]\((?<target><[^>]+>|[^\s\)]+)'

foreach ($file in $managedFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in [regex]::Matches($content, $linkPattern)) {
        $target = $match.Groups["target"].Value.Trim("<", ">")
        if ($target -match '^(?:https?|mailto):' -or $target.StartsWith("#")) {
            continue
        }

        $targetParts = $target -split "#", 2
        $pathPart = $targetParts[0]
        $fragment = if ($targetParts.Count -eq 2) { [Uri]::UnescapeDataString($targetParts[1]) } else { $null }
        if ([string]::IsNullOrWhiteSpace($pathPart)) {
            continue
        }

        $decodedPath = [Uri]::UnescapeDataString($pathPart)
        $resolvedPath = [IO.Path]::GetFullPath((Join-Path $file.DirectoryName $decodedPath))
        $displayFile = $file.FullName.Substring($repoRoot.Length).TrimStart([char[]]"\/")
        if (-not $resolvedPath.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            $errors.Add("Relative link leaves the repository in ${displayFile}: $target")
            continue
        }
        if (-not (Test-Path -LiteralPath $resolvedPath)) {
            $errors.Add("Broken link in ${displayFile}: $target")
            continue
        }
        if ($fragment -and (Test-Path -LiteralPath $resolvedPath -PathType Leaf) -and ([IO.Path]::GetExtension($resolvedPath) -eq ".md")) {
            $anchors = Get-MarkdownAnchors -Path $resolvedPath
            if (-not $anchors.Contains($fragment)) {
                $errors.Add("Broken heading anchor in ${displayFile}: $target")
            }
        }
    }
}

$rootReadme = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "README.md")
$entryPoints = @(
    "AGENTS.md",
    "docs/STATUS.md",
    "docs/PRODUCT.md",
    "docs/ARCHITECTURE.md",
    "docs/DEVELOPMENT.md",
    "docs/decisions/",
    "docs/tasks/",
    "CHANGELOG.md"
)

foreach ($entryPoint in $entryPoints) {
    if (-not $rootReadme.Contains($entryPoint)) {
        $errors.Add("Root README does not route to: $entryPoint")
    }
}

$statusPath = Join-Path $repoRoot "docs/STATUS.md"
$statusContent = Get-Content -Raw -LiteralPath $statusPath
$activeDirectory = Join-Path $repoRoot "docs/tasks/active"
$activeTasks = @(Get-ChildItem -LiteralPath $activeDirectory -File -Filter "*.md")
$requiredTaskHeadings = @(
    "Goal",
    "Related context",
    "Scope and acceptance",
    "Progress and verification",
    "User acceptance",
    "Next action"
)
$requiredTaskMetadata = @(
    "Status",
    "Created",
    "Base"
)

if ($activeTasks.Count -eq 0) {
    if ($statusContent -notmatch '(?m)^- None\.$') {
        $errors.Add("STATUS.md must say '- None.' when there are no active tasks")
    }
}
else {
    if ($statusContent -match '(?m)^- None\.$') {
        $errors.Add("STATUS.md says there is no active task, but active task files exist")
    }

    foreach ($task in $activeTasks) {
        $taskContent = Get-Content -Raw -LiteralPath $task.FullName
        $taskReference = "tasks/active/$($task.Name)"
        $statusLine = @($statusContent -split "`r?`n" | Where-Object { $_.Contains($taskReference) })
        if ($statusLine.Count -eq 0) {
            $errors.Add("STATUS.md does not index active task: $($task.Name)")
        }
        if ($taskContent -notmatch '(?m)^- Status: `(in_progress|waiting_user_acceptance|blocked)`\s*$') {
            $errors.Add("Active task has a missing or invalid status: $($task.Name)")
        }
        else {
            $taskStatus = $Matches[1]
            if ($statusLine.Count -gt 0 -and -not $statusLine[0].Contains("``$taskStatus``")) {
                $errors.Add("STATUS.md does not show '$taskStatus' for active task: $($task.Name)")
            }
        }
        foreach ($field in $requiredTaskMetadata) {
            if ($taskContent -notmatch "(?m)^- $([regex]::Escape($field)):\s+.+$") {
                $errors.Add("Active task lacks '$field' metadata: $($task.Name)")
            }
        }
        foreach ($heading in $requiredTaskHeadings) {
            if ($taskContent -notmatch "(?m)^## $([regex]::Escape($heading))\s*$") {
                $errors.Add("Active task lacks '$heading': $($task.Name)")
            }
        }
        if ($taskContent -notmatch '(?ms)^## Related context\s+.*?\[[^\]]+\]\([^\)]+\).*?^## ') {
            $errors.Add("Active task Related context has no document or code link: $($task.Name)")
        }
    }
}

$decisionIndex = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "docs/decisions/README.md")
$decisionFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "docs/decisions") -File -Filter "*.md" |
        Where-Object { $_.Name -match '^\d{4}-.+\.md$' }
)
foreach ($decision in $decisionFiles) {
    $decisionContent = Get-Content -Raw -LiteralPath $decision.FullName
    if (-not $decisionIndex.Contains($decision.Name)) {
        $errors.Add("Decision index does not include: $($decision.Name)")
    }
    if ($decisionContent -notmatch '(?m)^- Status: (Accepted|Proposed|Superseded)\s*$') {
        $errors.Add("Decision has a missing or invalid status: $($decision.Name)")
    }
    if ($decisionContent -notmatch '(?m)^- Date: \d{4}-\d{2}-\d{2}\s*$') {
        $errors.Add("Decision has a missing or invalid date: $($decision.Name)")
    }
    foreach ($heading in @("Context", "Decision", "Consequences", "Evidence")) {
        if ($decisionContent -notmatch "(?m)^## $heading\s*$") {
            $errors.Add("Decision lacks '$heading': $($decision.Name)")
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Output "ERROR: $_" }
    exit 1
}

Write-Output "Documentation check passed: $($managedFiles.Count) Markdown files, $($activeTasks.Count) active task(s), $($decisionFiles.Count) decision record(s)."
