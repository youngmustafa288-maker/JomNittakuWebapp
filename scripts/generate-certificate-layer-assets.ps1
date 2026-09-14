param(
  [string]$TemplatePath = "public/Certificate Template.jpg",
  [string]$ArtworkPath = "public/Image 1.jpg",
  [string]$OutputDirectory = "public/certificate-layers"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$specs = @(
  @("decor-top-left",1.8,1.2,23,15), @("decor-top-right",77,1.2,21.5,14),
  @("brand-logo-art",20.8,5.4,10.8,7.8), @("brand-name",31.8,6.7,48.5,3.7),
  @("brand-subtitle",32.1,10.3,44.5,2.6), @("brand-tagline",24.2,13.4,53.8,2.7),
  @("report-title-art",16,16.4,70,5.8), @("session-title",9.7,24.5,23,2.6),
  @("date-label",9.7,27.3,8,2.2), @("time-label",9.7,29.6,8,2.2),
  @("centre-label",9.7,31.9,9,2.2), @("coach-label",9.7,34.2,15,2.2),
  @("session-divider",9.7,37.7,80,0.7), @("training-title",9.7,39,29,2.6),
  @("taught-title",9.7,42,31,2.4), @("taught-dot-1",9.7,44.6,2.2,1.8),
  @("taught-dot-2",9.7,47,2.2,1.8), @("before-title",9.7,50,34,2.4),
  @("before-dot-1",9.7,52.6,2.2,1.8), @("before-dot-2",9.7,55,2.2,1.8),
  @("after-title",53.8,42,40,2.4), @("after-dot-1",53.8,44.6,2.2,1.8),
  @("after-dot-2",53.8,47,2.2,1.8), @("next-title",53.8,50,35,2.4),
  @("next-dot-1",53.8,52.6,2.2,1.8), @("next-dot-2",53.8,55,2.2,1.8),
  @("summary-divider",9.7,58,80,0.7), @("remarks-title-art",9.7,59.5,25,2.7),
  @("remark-line-1",9.7,64.1,80,0.7), @("remark-line-2",9.7,66.6,80,0.7),
  @("remark-line-3",9.7,68.8,80,0.7), @("remark-line-4",9.7,71,80,0.7),
  @("remark-line-5",9.7,73.2,80,0.7), @("certification-badge",5,75.8,18,15),
  @("contact-frame",34.4,76,31.8,14.2), @("contact-title-art",35.6,77,29.5,2.5),
  @("address-title-art",42.5,82.5,15,2.6), @("decor-bottom-left",1.8,84,23,14),
  @("footer-bar-art",0,89,100,11), @("decor-bottom-right",80,82,18.5,16.5)
)

$template = [Drawing.Bitmap]::new((Resolve-Path -LiteralPath $TemplatePath).Path)
$artwork = [Drawing.Bitmap]::new((Resolve-Path -LiteralPath $ArtworkPath).Path)
if ($template.Size -ne $artwork.Size) { throw "Template and artwork dimensions must match." }

$layerIndex = 0
$layers = $specs | ForEach-Object {
  $x = [Math]::Floor($template.Width * $_[1] / 100)
  $y = [Math]::Floor($template.Height * $_[2] / 100)
  $right = [Math]::Ceiling($template.Width * ($_[1] + $_[3]) / 100)
  $bottom = [Math]::Ceiling($template.Height * ($_[2] + $_[4]) / 100)
  [PSCustomObject]@{ Id = $_[0]; Index = $layerIndex++; X = $x; Y = $y; Width = $right - $x; Height = $bottom - $y; Area = ($right - $x) * ($bottom - $y) }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$owners = New-Object int[] ($template.Width * $template.Height)
$layers | Sort-Object Area | ForEach-Object {
  $candidate = $_
  for ($y = $candidate.Y; $y -lt ($candidate.Y + $candidate.Height); $y++) {
    for ($x = $candidate.X; $x -lt ($candidate.X + $candidate.Width); $x++) {
      $pixelIndex = ($y * $template.Width) + $x
      if ($owners[$pixelIndex] -eq 0) { $owners[$pixelIndex] = $candidate.Index + 1 }
    }
  }
}

foreach ($layer in $layers) {
  $differenceThreshold = if ($layer.Id -match "divider|remark-line") { 15 } else { 60 }
  $alphaScale = if ($differenceThreshold -eq 15) { 8 } else { 6 }
  $output = [Drawing.Bitmap]::new($layer.Width, $layer.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($localY = 0; $localY -lt $layer.Height; $localY++) {
    $sourceY = $layer.Y + $localY
    for ($localX = 0; $localX -lt $layer.Width; $localX++) {
      $sourceX = $layer.X + $localX
      if ($owners[($sourceY * $template.Width) + $sourceX] -ne ($layer.Index + 1)) { continue }

      $basePixel = $template.GetPixel($sourceX, $sourceY)
      $artPixel = $artwork.GetPixel($sourceX, $sourceY)
      $difference = [Math]::Max(
        [Math]::Abs($basePixel.R - $artPixel.R),
        [Math]::Max([Math]::Abs($basePixel.G - $artPixel.G), [Math]::Abs($basePixel.B - $artPixel.B))
      )
      $alpha = [Math]::Max(0, [Math]::Min(255, ($difference - $differenceThreshold) * $alphaScale))
      if ($alpha -gt 0) {
        $output.SetPixel($localX, $localY, [Drawing.Color]::FromArgb($alpha, $artPixel.R, $artPixel.G, $artPixel.B))
      }
    }
  }
  $output.Save((Join-Path $OutputDirectory "$($layer.Id).png"), [Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
}

$template.Dispose()
$artwork.Dispose()
Write-Output "Generated $($layers.Count) isolated certificate layers in $OutputDirectory."
