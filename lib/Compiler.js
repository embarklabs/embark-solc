const async = require('async');
const path = require('path');
const shelljs = require('shelljs');

function compileSolcContract(logger, filename, callback) {
  shelljs.exec(`solc --optimize --combined-json abi,bin,bin-runtime,compact-format,hashes,interface,metadata ${filename}`,
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

function compileSolc(logger, contractFiles, cb) {
  if (!contractFiles || !contractFiles.length) {
    return cb();
  }
  logger.info("compiling solidity contracts with command line solc...");
  let compiled_object = {};
  async.each(contractFiles,
    function (file, fileCb) {
      compileSolcContract(logger, file.filename, (err, compileString) => {
        if (err) {
          return fileCb(err);
        }

        let json = JSON.parse(compileString);

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
    });
}

module.exports = {
  compileSolc,
  compileSolcContract
};
