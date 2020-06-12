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
    .catch('error', function(e) { // Handle errors
      console.log('error getting file', e) ;
  });
}

module.exports = {
  onBuild: ({constants, utils}) => {
    try
      {
      const config = JSON.parse(process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
      }
    catch(e)
      {
      console.log('Error in downloader!', e.toString()) ;
      }
    // utils.build.cancelBuild({message:'closing deliberatly'}) ;
  },

  onPreBuild: async ({constants, utils})=>{
    // constants.PUBLISH_DIR ;

    try
      {
      console.log('Hello from external file downloader!', process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
      const config = JSON.parse(process.env.LOAD_EXTERNAL_FILES_CONFIG) ;
      if(config)
        {
        if(config.files.length){
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

          console.log('File download complete',message)
          utils.status.show({
            title:'File download complete',
            summary: `${message}`,
            }) ;

          // console.log(allCalls) ;
          }
          else{
            console.log('config length 0')
          }
        }
        else
          {
          console.log('! config') ;
          }
      }
    catch (e)
      {
      console.log()
      utils.build.failPlugin('error encountered from get-external-files '+ e.toString())
      }
  }
}
