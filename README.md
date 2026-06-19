# Relay

**A container utility for Adobe Tags**

Relay is a desktop application for managing Adobe Launch (Tags) containers. It lets you copy, compare, audit, export, and import rules and data elements between properties — including across different organizations.

---

## Features

- **Copy** — Copy selected rules and data elements from one property to another, with the option to skip or overwrite existing assets
- **Compare** — Diff two properties side-by-side and selectively apply missing or changed assets
- **Audit** — Generate a detailed Excel report for any property covering extensions, rules, data elements, orphaned assets, and naming analysis
- **Export** — Save a full property snapshot (rules, data elements, extensions) to a portable JSON file
- **Import** — Restore a snapshot into any property with per-item selection (rules, data elements, and extensions individually checkable). Pre-flight validation blocks the import if required extensions are missing from the destination. Extension settings can also be selectively imported — overwriting tracked variables, custom code, tracking server, report suites, and other configuration in the destination.
- **Add to Library** — After any copy or import, add the affected assets to a new or existing development library ready to build and publish

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- An Adobe Developer Console project configured per the instructions below

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

## Configuration & Authentication

Relay authenticates against the Adobe Reactor API using **OAuth Server-to-Server** credentials. These are org-level service credentials — not tied to an individual user — so they need to be created once per Adobe org you want to work with.

### 1. Create an Adobe Developer Console project

1. Go to [Adobe Developer Console](https://developer.adobe.com/console/) and select your org from the top-right selector
2. Create a new project (or use an existing one)
3. Click **Add API** and select **Experience Platform Launch API**
4. Choose **OAuth Server-to-Server** as the authentication type
5. Select a product profile that has access to the Tags properties you need — typically an Admin or Developer profile in the Adobe Launch product
6. Save the project

### 2. Find your credentials

| Field | Where to find it |
|---|---|
| **Client ID** | Developer Console → Your project → OAuth Server-to-Server → Credentials details |
| **Client Secret** | Same page — click "Retrieve client secret" |
| **Org ID** | Developer Console → top-right org selector (format: `XXXX@AdobeOrg`), or Adobe Admin Console → Settings |

> **One set of credentials per org.** If you work across multiple Adobe organizations, create a Developer Console project in each org and add a separate credential profile in Relay for each.

### 3. Add credentials to Relay

On first launch, click the **+** button on the sign-in screen and enter your credentials. You can also bulk-import multiple profiles from a JSON file:

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
2. Click **Switch** to sign in with credentials for the target organization
3. Select the destination property and click **Import**
4. Choose which rules, data elements, and extension settings to import
5. Choose **skip existing** or **overwrite existing** and confirm

> Pre-flight validation checks that all required extensions are installed in the destination before allowing the import to proceed. Install any flagged extensions in Adobe Tags first, or deselect the affected items.

---

## Tech Stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://evite.netlify.app/)
- [React](https://react.dev/)
- [SheetJS (xlsx)](https://sheetjs.com/) for Excel export
- Adobe [Reactor API](https://developer.adobe.com/experience-platform-apis/references/reactor/)
