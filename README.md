# Download assets for netlify build ;

set environment variable LOAD_EXTERNAL_FILES_CONFIG with JSON value sample
```
{
  baseURL:"https://pinnacleplaza.blob.core.windows.net/assets",
  // overrides saveAt
  localPath:"img/icons",
  files:[
    {"extFile":"favicon.ico", "saveAt":""},
    {"extFile":"favicon-16x16.png", "saveAt":"img/icons"},
    {"extFile":"apple-icon-114x114.png", "saveAt":"img/icons"},
    {"extFile":"ms-icon-144x144.png", "saveAt":"img/icons"},
    {"extFile":"apple-icon-152x152.png", "saveAt":"img/icons"},

  ]
}
```
