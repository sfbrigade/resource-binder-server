# React + Vite

## Authentication tests

From the repository root, run `npm test -w client` for the login, verification,
recovery, registration, logout, and mobile-navigation component tests. They render
the real screens with mocked API responses, including slow requests and failures.

`npm test` also runs the server integration suite, which requires Docker.

## Vite template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh
