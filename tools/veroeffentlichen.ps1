# Veröffentlicht den Kalkulator auf GitHub Pages (wie beim Gang-Sheet-Konfigurator).
#
# Hochgeladen werden in den Zweig „gh-pages“ NUR index.html, css/ und js/.
# Der Zweig liegt im Ordner .site (wird von Git ignoriert).
#
# Benutzung (im Projektordner):
#   powershell -ExecutionPolicy Bypass -File tools\veroeffentlichen.ps1 -Nachricht "Was sich geändert hat"

param([string]$Nachricht = 'Webseite aktualisieren')
# Nicht 'Stop': Git schreibt normale Statusmeldungen auf den Fehlerkanal, das würde das Skript abbrechen
$ErrorActionPreference = 'Continue'

$root = Split-Path $PSScriptRoot -Parent
$site = Join-Path $root '.site'
if (-not (git -C $root remote)) { throw 'Kein GitHub-Ziel eingetragen. Einmalig: git remote add origin https://github.com/Jackolos/dtf-kalkulator.git' }

# Zweig gh-pages im Ordner .site bereitstellen
git -C $root show-ref --verify --quiet refs/heads/gh-pages
$hasBranch = $LASTEXITCODE -eq 0
if (-not (Test-Path (Join-Path $site '.git'))) {
  if ($hasBranch) { git -C $root worktree add $site gh-pages 2>$null | Out-Null }
  else { git -C $root worktree add --orphan -b gh-pages $site 2>$null | Out-Null }
}

# Alten Inhalt leeren und aktuelle App-Dateien hineinkopieren
Get-ChildItem $site -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item (Join-Path $root 'index.html') $site
Copy-Item (Join-Path $root 'css') $site -Recurse
Copy-Item (Join-Path $root 'js') $site -Recurse
New-Item (Join-Path $site '.nojekyll') -ItemType File | Out-Null

# Versionsnummer aus dem Inhalt aller Dateien an jeden Skript- und Stil-Link hängen,
# damit Browser nach einem Update keine alten Dateien aus dem Zwischenspeicher mischen.
$hashes = (Get-ChildItem (Join-Path $site 'js'), (Join-Path $site 'css') -File -Recurse | Sort-Object FullName |
  Get-FileHash -Algorithm MD5 | ForEach-Object Hash) -join ''
$md5 = [Security.Cryptography.MD5]::Create()
$stamp = ([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::ASCII.GetBytes($hashes)))).Replace('-', '').Substring(0, 8).ToLower()
$indexPath = Join-Path $site 'index.html'
$html = [IO.File]::ReadAllText($indexPath, [Text.Encoding]::UTF8)
$html = [regex]::Replace($html, '((?:src|href)="(?:js|css)/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', "`$1?v=$stamp`"")
[IO.File]::WriteAllText($indexPath, $html, (New-Object Text.UTF8Encoding $false))

git -C $site add -A
git -C $site diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git -C $site -c user.name='Jackolos' -c user.email='Jackolos@users.noreply.github.com' commit -q -m $Nachricht
} else { Write-Host 'Keine neuen Änderungen an der Webseite.' }

git -C $site push -u origin gh-pages
if ($LASTEXITCODE -ne 0) { Write-Host 'Hochladen fehlgeschlagen (siehe Meldung oben).' -ForegroundColor Red; exit 1 }
Write-Host ''
Write-Host 'Hochgeladen. Die Seite ist in 1-2 Minuten aktuell: https://jackolos.github.io/dtf-kalkulator/' -ForegroundColor Green
