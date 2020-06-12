const request = require('request') ;
const https = require('https') ;
const path  = require('path') ;
const fs = require('fs') ;
const axios = require('axios') ;
let succ = 0 ;
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
