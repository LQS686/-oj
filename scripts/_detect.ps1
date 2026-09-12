$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$paths = @('app/page.tsx','app/admin/problems/[id]/testcases/page.tsx')
foreach ($p in $paths) {
  $win = $p -replace '/','\'
  $cur = ([System.IO.File]::ReadAllText((Join-Path $root $win))).Replace("`r`n","`n")
  $head = (((& git show "HEAD:$p") | Out-String) -replace "`r`n","`n")
  "=== $p"
  "  len cur=$($cur.Length) head=$($head.Length)"
  $out = @()
  foreach ($c in [char[]]'abcdefghijklmnopqrstuvwxyz') {
    $s = [string]$c
    $a = ([regex]::Matches($cur, $s)).Count
    $b = ([regex]::Matches($head, $s)).Count
    if ($a -ne $b) { $out += ("{0}:{1}/{2}" -f $s, $a, $b) }
  }
  "  counts cur/head differ -> $($out -join '  ')"
}
