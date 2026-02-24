

# Modern Rounded-Dot QR Code

Simple change: swap `QRCodeSVG` from `qrcode.react` for `QRCode` from `react-qrcode-logo` to get rounded dots and styled eyes — no center logo needed.

## Changes

| File | Change |
|---|---|
| `package.json` | Add `react-qrcode-logo` |
| `src/pages/Listen.tsx` | Replace `QRCodeSVG` import with `QRCode` from `react-qrcode-logo`, configure `qrStyle="dots"`, `eyeRadius={8}`, remove old `qrcode.react` import |

## Configuration

```tsx
<QRCode
  value={`https://musicnerdtv.lovable.app/companion/${trackId}`}
  size={80}
  qrStyle="dots"
  eyeRadius={8}
  fgColor="#ffffff"
  bgColor="transparent"
  ecLevel="M"
  quietZone={0}
/>
```

This gives rounded circular dots instead of harsh squares, plus softly rounded eye corners — significantly more modern with zero complexity.

