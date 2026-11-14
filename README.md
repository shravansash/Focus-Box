# Focus Box — Web version (Chrome/Edge extension)

This project uses HTML, CSS and JavaScript. The dashboard is an extension page, so it can control browser blocking through Chrome's Manifest V3 `declarativeNetRequest` API.

## Important limitation
A normal website cannot block other websites or control other browser tabs. **Install this as a Chrome/Edge extension** to enforce website blocking. `index.html` is a standalone preview only; it does not block sites.

## Install (Chrome or Chromium-based Edge)
1. Extract this folder.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this folder (`focusbox_web`).
6. Open the Focus Box extension's **Details** page and choose **Extension options**, or click the extension icon and open Dashboard.

The extension asks for permission to manage browser requests and tabs. Blocking applies only in that browser profile, while a focus session is active.

## Features
- Focus modes and customisable session duration
- Session timer and automatic expiry
- Website blocklist (domains such as `youtube.com`, `instagram.com`)
- Temporary override request with a written reason and a time limit
- Focus session and blocked-page attempt statistics
- Local session history and weekly summary
- Optional ESP32 BLE connection using the Nordic UART Service (NUS) profile

## ESP32 BLE
The BLE panel uses the Nordic UART Service UUIDs:
- Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- Write characteristic: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`

Your ESP32 firmware must expose that service and characteristic. The app sends a UTF-8 line like:
`MODE=STUDY;MINUTES=45;ACTION=START\n`

Web Bluetooth requires a supported browser and a secure context. It is not supported in every browser/device combination. The BLE feature is optional; the extension works without it.

## Notes
- Data is stored locally using `chrome.storage.local` (extension) or `localStorage` (standalone preview).
- The extension does not block apps or control the whole device.
- A user can disable/remove the extension or use another browser/profile. This is a productivity aid, not tamper-proof parental-control software.
- The reason field records the user's explanation; it cannot objectively determine whether a reason is "valid".
