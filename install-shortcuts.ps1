# 为便携版创建桌面 / 开始菜单快捷方式。
#
# 便携版没有安装程序，所以 Windows 不会自动创建快捷方式，
# 开始菜单里没有条目，Windows 搜索也就找不到它。
# 这个脚本补上这一步，并且可以随时撤销。
#
#   install-shortcuts.ps1            创建快捷方式
#   install-shortcuts.ps1 -Remove    撤销快捷方式（不删除程序本体）
#
# 一般不需要直接运行本脚本，双击同目录的 install-shortcuts.cmd 即可。

[CmdletBinding()]
param(
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

function Write-Step($text) { Write-Host "  $text" }
function Write-Head($text) {
    Write-Host ''
    Write-Host "== $text" -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'DeepSeek Harness 0.1.5 — 快捷方式安装器' -ForegroundColor White
Write-Host '=========================================' -ForegroundColor DarkGray

# ---------------------------------------------------------------- 定位程序

Write-Head '定位程序'

$appDir = $PSScriptRoot
if (-not $appDir) { $appDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

$exe = Get-ChildItem -Path $appDir -Filter 'DeepSeek Harness*.exe' -File -ErrorAction SilentlyContinue |
       Select-Object -First 1

if (-not $exe) {
    Write-Host ''
    Write-Host "  [错误] 在下面这个目录里找不到主程序：" -ForegroundColor Red
    Write-Host "         $appDir" -ForegroundColor Red
    Write-Host ''
    Write-Host '  请把本脚本放在「DeepSeek Harness 0.1.5.exe」所在的文件夹里再运行。'
    exit 1
}

$exePath = $exe.FullName
$exeName = $exe.Name
$appName = [System.IO.Path]::GetFileNameWithoutExtension($exeName)

Write-Step "程序目录 : $appDir"
Write-Step "主程序   : $exeName"

# ---------------------------------------------------------------- 目标位置

$desktop   = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$appPaths  = "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\$exeName"

$shortcuts = @(
    [pscustomobject]@{ Label = '桌面';     Path = (Join-Path $desktop   "$appName.lnk") },
    [pscustomobject]@{ Label = '开始菜单'; Path = (Join-Path $startMenu "$appName.lnk") }
)

# ---------------------------------------------------------------- 撤销模式

if ($Remove) {
    Write-Head '撤销快捷方式'

    foreach ($item in $shortcuts) {
        if (Test-Path -LiteralPath $item.Path) {
            Remove-Item -LiteralPath $item.Path -Force
            Write-Step "[已删除] $($item.Label)：$($item.Path)"
        } else {
            Write-Step "[跳过] $($item.Label) 本来就不存在"
        }
    }

    if (Test-Path $appPaths) {
        Remove-Item -Path $appPaths -Recurse -Force
        Write-Step "[已删除] 注册表 App Paths 项"
    } else {
        Write-Step '[跳过] 注册表 App Paths 项本来就不存在'
    }

    Write-Host ''
    Write-Host '  完成。程序本体没有被删除。' -ForegroundColor Green
    Write-Host '  想彻底移除，直接删掉整个文件夹即可。'
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------- 创建快捷方式

Write-Head '创建快捷方式'

$shell = New-Object -ComObject WScript.Shell
$created = 0

foreach ($item in $shortcuts) {
    $parent = Split-Path -Parent $item.Path
    if (-not (Test-Path -LiteralPath $parent)) {
        Write-Step "[跳过] $($item.Label)：目标目录不存在"
        continue
    }

    try {
        $lnk = $shell.CreateShortcut($item.Path)
        $lnk.TargetPath       = $exePath
        $lnk.WorkingDirectory = $appDir
        $lnk.IconLocation     = "$exePath,0"
        $lnk.Description      = "$appName  (dsh core 0.1.5-rc.2)"
        $lnk.Save()
        $created++
        Write-Step "[完成] $($item.Label)：$($item.Path)"
    } catch {
        Write-Step "[失败] $($item.Label)：$($_.Exception.Message)"
    }
}

# App Paths：让 Win+R 直接输入程序名就能启动，部分启动器和第三方工具也靠它查找
Write-Head '注册 App Paths（可选）'

try {
    New-Item -Path $appPaths -Force | Out-Null
    Set-ItemProperty -Path $appPaths -Name '(default)' -Value $exePath
    Set-ItemProperty -Path $appPaths -Name 'Path' -Value $appDir
    Write-Step "[完成] Win+R 输入 $appName 即可启动"
} catch {
    Write-Step "[跳过] 注册表写入失败：$($_.Exception.Message)"
    Write-Step '       这不影响快捷方式使用。'
}

# ---------------------------------------------------------------- 结果

Write-Head '结果'

if ($created -gt 0) {
    Write-Host "  成功创建 $created 个快捷方式。" -ForegroundColor Green
    Write-Host ''
    Write-Host '  现在可以：'
    Write-Host '    - 从桌面双击图标启动'
    Write-Host '    - 在开始菜单或 Windows 搜索里搜「DeepSeek Harness 0.1.5」'
    Write-Host '    - 启动后右键任务栏图标 → 固定到任务栏'
} else {
    Write-Host '  没有创建任何快捷方式，请看上面的错误信息。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  想撤销：运行 install-shortcuts.cmd 时带 -Remove 参数，'
Write-Host '          或在 PowerShell 里执行：'
Write-Host "          .\install-shortcuts.ps1 -Remove"
Write-Host ''
Write-Host '  提示：整个文件夹可以随意移动。若移动了位置，'
Write-Host '        重新运行一次本脚本即可让快捷方式指向新位置。'
Write-Host ''
