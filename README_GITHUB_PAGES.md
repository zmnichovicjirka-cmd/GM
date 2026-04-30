# Nasazení na GitHub Pages

Aby aplikace fungovala na GitHub Pages správně a nebyla tam jen „černá obrazovka“, provedl jsem několik úprav:

1. **Relativní cesty**: V `index.html` a v konfiguraci Vite (`vite.config.ts`) jsou nyní nastaveny relativní cesty (`base: './'`). To zajistí, že se skripty a styly načtou, i když je aplikace v podadresáři (např. `uzivatel.github.io/moje-aplikace/`).
2. **Odstranění Importmap**: Vyčistil jsem `index.html` od redundantních importů, které mohly kolidovat s buildem Vite.

## ⚠️ Důležitá upozornění pro GitHub Pages

GitHub Pages je **statický hosting**. To přináší následující omezení:

1. **Express Server nepoběží**: Soubor `server.ts` sloužil pro nahrávání obrázků na Cloudinary. Na GitHub Pages tento server nebude fungovat. 
   - **Důsledek**: Nahrávání obrázků do lekcí přes Cloudinary nebude fungovat.
   - **Řešení**: Aplikace se automaticky přepne do režimu, kdy obrázky ukládá jako Base64 přímo do Firebase/LocalStorage. Pozor ale na limit 1MB ve Firestore.
2. **API Klíče**: API klíč pro Gemini je do aplikace „vpečen“ během buildu. Pokud build provádíte lokálně, ujistěte se, že máte v souboru `.env` nastaveno `GEMINI_API_KEY`.
   - **NOVINKA**: Od verze v10.2 uživatelé mohou v nastavení zadat vlastní API klíč, který se uloží do jejich Firebase účtu. Tento klíč má přednost před systémovým klíčem a umožňuje vyhnout se sdíleným kvótám.
   - **Sdílení**: Uživatelé mohou své klíče sdílet s ostatními zadáním jejich e-mailu v nastavení.

## Postup nasazení

1. **Build aplikace**:
   V terminálu (lokálně) spusťte:
   ```bash
   npm install
   npm run build
   ```
2. **Nahrání na GitHub**:
   Nahrajte obsah složky `dist` (nikoli celou aplikaci!) do větve `gh-pages` nebo do složky `docs` v hlavní větvi, podle toho, jak máte GitHub Pages nastavené.

## Pokud stále vidíte černou obrazovku
Zkontrolujte v konzoli prohlížeče (F12), zda se nenačítají nějaké soubory (404). Pokud ano, pravděpodobně je problém v cestě v `index.html`. V tomto nastavení by to ale mělo být v pořádku.
