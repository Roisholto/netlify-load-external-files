const path  = require('path') ;
const fs = require('fs') ;
const axios = require('axios') ;

// this number of file successfully saved ;
let succ = 0 ;

function fetchFile(file, saveAt, index){
  return axios.get(file, {responseType: 'stream'})
    .then(async function(response) {
      console.log('statusCode:', response.status, file, index);
      // console.log('headers:', response.headers);

      if(response.status == 200){
        await response
        .data
          .pipe(fs.createWriteStream(saveAt))
          .on('finish', function() {
            succ++ ;
          // write.close(function(c){
          console.log('done writing file '+ index) ;
          // });
        });
      }
    })
    .catch( function(e) { // Handle errors
      console.log('error getting file', e) ;
  });
}

module.exports = {
  onPreBuild: async ({constants, utils})=>{
    console.log('Hello from netlify external file downloader!', process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
    // check that LOAD_EXTERNAL_FILES_CONFIG is set in ENV
    if(process.env.LOAD_EXTERNAL_FILES_CONFIG)
      {
      let config ;
      try
        {
        config = JSON.parse(process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
        }
      catch (e)
        {
        utils.build.failPlugin('error encountered from get-external-files '+ e.toString())
        return
        }

      if(config)
        {
        if(config.files.length)
          {
          const calls = [] ;
          let req ;
          let file ;
          let base = config.baseURL ;
          let saveAt

          config.files.forEach( async function(v, index){
            file = base+'/'+v.extFile ;
            local_name = path.basename(file) ;
            local_dir = path.join('./public'/*constants.PUBLISH_DIR*/, v.saveAt)

            if(!fs.existsSync(path.join('./public', v.saveAt)))
              fs.mkdirSync(local_dir, { recursive: true })

            saveAt = path.join(local_dir, local_name)
            calls.push(fetchFile(file, saveAt, index)) ;
          })

          console.log('done fetching files') ;
          let hh = await Promise.all(calls) ;
          let message= `${succ} of ${config.files.length} saved` ;

          console.log('File download complete', message)
          utils.status.show({
            title:'File download complete',
            summary: `${message}`,
            }) ;
          }

        }
      }
    else
      {
      console.log('environment variable LOAD_EXTERNAL_FILES_CONFIG not set') ;
      }


  }
}
