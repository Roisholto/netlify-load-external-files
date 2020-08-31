const request = require('request') ;
const https = require('https') ;
const path  = require('path') ;
const fs = require('fs') ;
const axios = require('axios') ;
let succ = 0 ;
process.env.LOAD_EXTERNAL_FILES_CONFIG = JSON.stringify(
  {"baseURL":"https://pinnacleplaza.blob.core.windows.net/assets","localPath":"img/icons","files":[{"extFile":"favicon.ico","saveAt":""}, {"extFile":"logo.png", "saveAt":"img"},{"extFile":"favicon-16x16.png","saveAt":"img/icons"},{"extFile":"favicon-32x32.png","saveAt":"img/icons"},{"extFile":"favicon-96x96.png","saveAt":"img/icons"},{"extFile":"ms-icon-70x70.png","saveAt":"img/icons"},{"extFile":"ms-icon-144x144.png","saveAt":"img/icons"},{"extFile":"ms-icon-150x150.png","saveAt":"img/icons"},{"extFile":"ms-icon-310x310.png","saveAt":"img/icons"},{"extFile":"apple-icon.png","saveAt":"img/icons"},{"extFile":"apple-icon-57x57.png","saveAt":"img/icons"},{"extFile":"apple-icon-60x60.png","saveAt":"img/icons"},{"extFile":"apple-icon-72x72.png","saveAt":"img/icons"},{"extFile":"apple-icon-76x76.png","saveAt":"img/icons"},{"extFile":"apple-icon-114x114.png","saveAt":"img/icons"},{"extFile":"apple-icon-120x120.png","saveAt":"img/icons"},{"extFile":"apple-icon-144x144.png","saveAt":"img/icons"},{"extFile":"apple-icon-152x152.png","saveAt":"img/icons"},{"extFile":"apple-icon-180x180.png","saveAt":"img/icons"},{"extFile":"apple-icon-precomposed.png","saveAt":"img/icons"},{"extFile":"android-icon-36x36.png","saveAt":"img/icons"},{"extFile":"android-icon-48x48.png","saveAt":"img/icons"},{"extFile":"android-icon-72x72.png","saveAt":"img/icons"},{"extFile":"android-icon-144x144.png","saveAt":"img/icons"},{"extFile":"android-icon-192x192.png","saveAt":"img/icons"},{"extFile":"safari-pinned-tabs.svg","saveAt":"img/icons"}]}) ;

run() ;

async function run (){
  const config = JSON.parse(process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
  if(config)
    {
    if(config.files.length){
      const calls = [] ;
      let req ;
      let file ;
      let base = config.baseURL ;
      let saveAt

      config.files.forEach(function(v, index){
        file = base+'/'+v.extFile ;
        local_name = path.basename(file) ;
        local_dir = saveAt = path.join('./shopper', v.saveAt)

        if(!fs.existsSync(path.join('./shopper', v.saveAt)))
          fs.mkdirSync(local_dir, { recursive: true })

        saveAt = path.join(local_dir, local_name)
        calls.push(fetchFile(file, saveAt, index))

      })

      console.log('done fetching files') ;
      let hh = Promise.all(calls)
        .then(function(v){
          console.log('v', v)
          let message= `${succ} of ${config.files.length} saved` ;

          console.log('File download complete',message)
          /*utils.status.show({
            title:'File download complete',
            summary: `${message}`,
          }) ;*/
        })

      // console.log(allCalls) ;
      // utils.status.show({summary: 'fetched all files',}) ;
      }
    }
}

function fetchFile(file, saveAt, index){
  return axios.get(file, {responseType: 'stream'})
    .then(function(response) {
      console.log('statusCode:', response.status, file, index);
      // console.log('headers:', response.headers);

      if(response.status == 200){
        response
          .data
          .pipe(fs.createWriteStream(saveAt))
          //.on('finish', function() {
            succ++ ;
          // write.close(function(c){
          //console.log('done writing file '+ index) ;
          // });
           // });
      }
    })
    .catch('error', function(e) { // Handle errors
      console.log('error getting file', e) ;
    });
}
