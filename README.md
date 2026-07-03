# Kumagro · Programa SNGM

Sistema de gestión del Programa SNGM (lotes, visitas técnicas, entregas y
convenios con firma electrónica vía Adobe Acrobat Sign), autoalojado en una
VM Windows detrás de la VPN de la empresa.

- **Instalación y operación**: ver [DEPLOY.md](DEPLOY.md)
- **Backend**: Node.js + Express + PostgreSQL (`backend/`)
- **Frontend**: 6 páginas HTML sin build (`public/`)
- Migrado desde la versión Google Apps Script + Sheets + Drive
  (documentada en la rama `claude/great-cray-bang3u`).
