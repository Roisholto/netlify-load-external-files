const extFile = require('../index.js') ;

process.env.LOAD_EXTERNAL_FILES_CONFIG = JSON.stringify(
  {
    baseURL:"https://pinnacleplaza.blob.core.windows.net/assets",
    //overrides saveAt
    localPath:"img/icons",
    files:[
      {"extFile":"favicon.ico", "saveAt":""},
      {"extFile":"favicon-16x16.png", "saveAt":"img/icons"},
      {"extFile":"apple-icon-114x114.png", "saveAt":"img/icons"},
      {"extFile":"ms-icon-144x144.png", "saveAt":"img/icons"},
      {"extFile":"apple-icon-152x152.png", "saveAt":"img/icons"},

    ]
  }) ;

extFile.onPreBuild({
  constants:{

  },
  utils:{
    build:{
      failPlugin(a){
        console.log('failed plugin', a)
      }
    },
    status:{
      show:function(a){
        console.log('showing ',a) ;
      }
    }
  }
  });
