# Relay

**A container utility for Adobe Tags**

Relay is a desktop application for managing Adobe Launch (Tags) containers. It lets you copy, compare, audit, export, and import rules and data elements between properties — including across different organizations.

---

## Features

- **Copy** — Copy selected rules and data elements from one property to another, with the option to skip or overwrite existing assets
- **Compare** — Diff two properties side-by-side and selectively apply missing or changed assets
- **Audit** — Generate a detailed Excel report for any property covering extensions, rules, data elements, orphaned assets, and naming analysis
- **Export** — Save a full property snapshot (rules, data elements, extensions) to a portable JSON file
- **Import** — Restore a snapshot into any property, including properties in a different organization; extension IDs are remapped automatically by package name
- **Add to Library** — After any copy or import, add the affected assets to a new or existing development library ready to build and publish

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- An Adobe Developer Console project with:
  - **OAuth Server-to-Server** credentials (Client ID + Client Secret)
  - The **Experience Platform Launch** (or **Adobe Experience Platform**) API added to the project with appropriate product profiles

---

## Setup

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Build a distributable
npm run build
```

---

## Authentication

On first launch, add your credentials using the **+** button on the sign-in screen. You will need:

| Field | Where to find it |
|---|---|
| **Client ID** | Adobe Developer Console → Your project → OAuth Server-to-Server |
| **Client Secret** | Same location — click "Retrieve client secret" |
| **Org ID** | Adobe Developer Console → top-right org selector, or Admin Console |

You can also bulk-import multiple credential profiles from a JSON file:

```json
[
  {
    "name": "Acme Corp Production",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "orgId": "XXXXXXXXXXXXXXXXXXXXXXXX@AdobeOrg"
  }
]
```

> **Credentials are stored locally** in the Electron app data folder and are never written to the project directory or source code.

---

## Cross-Organization Transfers

To move a container from one Adobe org to another:

1. Select the source property and click **Export** — save the `.json` file
2. Sign out and sign in with credentials for the target organization
3. Select the destination property and click **Import**
4. Choose **skip existing** or **overwrite existing** and confirm

> The target property must have the same extensions installed before importing. Any missing extensions are flagged as warnings; all other assets still import successfully.

---

## Tech Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://evite.netlify.app/)
- [React](https://react.dev/)
- [SheetJS (xlsx)](https://sheetjs.com/) for Excel export
- Adobe [Reactor API](https://developer.adobe.com/experience-platform-apis/references/reactor/)
