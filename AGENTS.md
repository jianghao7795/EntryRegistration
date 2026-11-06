# Repository Guidelines

## Project Structure & Module Organization

This repository is a native WeChat Mini Program. `app.js`, `app.json`, and `app.wxss` define startup, routing, and global styles. The four files in `pages/index/` implement visitor registration, consent, handwritten signatures, and the submission result. `utils/api.js` wraps public endpoints, `utils/registration.js` handles form rules and payloads, and `utils/signature.js` exports PNG signatures. `config.js` maps WeChat release channels to API environments. Keep reusable logic in `utils/` and page behavior beside its WXML and WXSS.

## Development & Validation

Import this directory into WeChat DevTools and compile it directly. No npm runtime dependencies or npm build step are required. With Node.js 20 or later:

- `npm run check` validates JavaScript, JSON, page files, event bindings, and package exclusions.
- `npm test` runs the registration regression tests with mocked WeChat APIs.

Also compile WXML/WXSS in DevTools and manually verify keyboard behavior, picker selection, signature drawing and clearing, failed requests, and successful submission on a real device.

## Coding Style & Naming Conventions

Use two spaces, single quotes, and the existing semicolon-free JavaScript style. Use CommonJS modules, camelCase JavaScript names, kebab-case CSS classes, and Chinese interface copy. Keep canvas nodes and contexts on page instances rather than in `data`. Avoid introducing framework or build dependencies for native controls.

## API & Data Handling

Preserve the existing public endpoint paths, snake_case fields, and `{ data: ... }` request body. Development and trial releases use the test backend; production releases use the production backend. Current frontend required fields are name, consent, and signature. Preserve input on failure, prevent concurrent submissions, and never automatically retry POST requests. Keep visitor information and signatures out of logs and persistent storage. Exclude tests from Mini Program packages.

## Commit & Review Guidelines

No Git history is available in this workspace. Use concise imperative commit titles. Reviews should describe behavior changes, validation performed, and any remaining device or backend verification. Include screenshots for visible changes and synthetic data for tests.

