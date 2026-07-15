# Admit card portal

A student-facing admit card lookup site plus an admin panel for adding and
removing records, backed by a real Node.js server and a JSON file database.

## Requirements

- [Node.js](https://nodejs.org) 18 or later. Nothing else — no `npm install`,
  no external packages. The whole backend runs on Node's built-in modules.

## Run it

```
node server.js
```

Then open **http://localhost:3000** in your browser.

On first run, the server creates `data/admin.json` with a default admin
access code of **`admin123`** (hashed, not stored in plain text) and seeds
`data/students.json` with two example records if it doesn't already exist.

## How it's organized

```
admit-card-portal/
  server.js            Node http server + REST API (no framework, no deps)
  data/
    students.json       admit card records (created/edited at runtime)
    admin.json           hashed admin access code (created on first run)
  public/
    index.html           frontend markup
    styles.css            frontend styles
    app.js                 frontend logic, talks to the API via fetch
```

## API

| Method | Route                          | Auth        | Description                              |
|--------|---------------------------------|-------------|-------------------------------------------|
| POST   | `/api/find-admit-card`          | none        | `{ roll, dob }` → matching record or 404 |
| POST   | `/api/admin/login`              | none        | `{ code }` → `{ token }`                 |
| GET    | `/api/admin/students`           | Bearer token | list all records                        |
| POST   | `/api/admin/students`           | Bearer token | create a record                         |
| DELETE | `/api/admin/students/:roll`     | Bearer token | delete a record by roll number          |
| POST   | `/api/admin/change-code`        | Bearer token | `{ newCode }` → rotate the admin code   |

Admin tokens are issued in memory and expire after 2 hours or on server
restart — log in again from the admin tab if a request comes back
"session expired."

## Notes and next steps

This is built to run and be readable, not to be a production system as-is.
Before putting real student data behind it, you'd want to:

- **Move off the JSON file** to a real database (SQLite is a drop-in next
  step, then Postgres/MySQL if this needs to scale or run on more than one
  server process).
- **Put it behind HTTPS** — right now it's plain HTTP, fine for local use,
  not fine for real student data on the open internet.
- **Change the default admin code immediately** via `/api/admin/change-code`
  or by editing `data/admin.json`, and consider per-admin accounts instead
  of one shared code.
- **Add rate limiting** on the login and lookup endpoints so they can't be
  brute-forced.
- **Add real photo upload and storage** if you want the photo box to be an
  actual student photo instead of initials.
