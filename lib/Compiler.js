const async = require('async');
const shelljs = require('shelljs');
const fs = require('fs');
const path = require('path');

function compileSolcContract(logger, filename, allowedDirectories, callback) {
  const command = `solc --optimize --combined-json abi,bin,bin-runtime,compact-format,hashes,interface,metadata --allow-paths ${allowedDirectories.join(',')} ${filename}`;
  shelljs.exec(command,
     {silent: true}, (code, stdout, stderr) => {

    if (stderr) {
      logger.warn(stderr);
    }

    if (code !== 0) {
      return callback(`solc exited with error code ${code}`);
    }

    if (!stdout) {
      return callback('Execution returned nothing');
    }

    callback(null, stdout.replace(/\n/g, ''));
  });
}

function compileSolc(embark, contractFiles, cb) {
  if (!contractFiles || !contractFiles.length) {
    return cb();
  }

  const logger = embark.logger;
  const outputBinary = embark.pluginConfig.outputBinary;
  const outputDir = embark.config.buildDir + embark.config.contractDirectories[0];

  const solc = shelljs.which('solc'); 
  if (!solc) {
    logger.warn('solc is not installed on your machine');
    logger.info('You can install it by following the instructions on: http://solidity.readthedocs.io/en/latest/installing-solidity.html');
    process.exit();
  }
  
  logger.info("compiling solidity contracts with command line solc...");

  const allowedDirectories = contractFiles.map((contractFile) => path.dirname(path.join(process.cwd(), contractFile.path)))
                                          .filter((x, i, a) => a.indexOf(x) == i);

  let compiled_object = {};
  async.each(contractFiles,
    function (file, fileCb) {
      compileSolcContract(logger, file.filename, allowedDirectories, (err, compileString) => {
        if (err) {
          return fileCb(err);
        }

        let jsonStart = compileString.indexOf("\"contracts\":{");

        let json = JSON.parse(compileString.substr(jsonStart - 1));

        for (let contractFile in json.contracts) {
          let className = contractFile.substr( contractFile.indexOf(":") + 1);
          let fileName = contractFile.substr(0, contractFile.indexOf(":"));
          
          let contract = json.contracts[contractFile];
          
          compiled_object[className] = {};
          compiled_object[className].code = contract.bin
          compiled_object[className].runtimeBytecode = contract["bin-runtime"];
          compiled_object[className].functionHashes = contract.hashes;
          compiled_object[className].abiDefinition = JSON.parse(contract.abi);
          compiled_object[className].filename = fileName;
        }

        fileCb();
      });
    },
    function (err) {
      cb(err, compiled_object);  
      if(outputBinary){
        embark.events.on("outputDone", function() {
          Object.keys(compiled_object).map(function(className, index) {
            fs.writeFile(path.join(outputDir, className + ".bin"), compiled_object[className].bin, (err) => {
              if (err) {
                logger.error("Error writing binary file: " + JSON.stringify(err));
              }
            });
          });
        });
      }
    });
}

module.exports = {
  compileSolc,
  compileSolcContract
};
