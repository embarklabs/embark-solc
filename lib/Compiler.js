const async = require('async');
const shelljs = require('shelljs');
const fs = require('fs');
const path = require('path');

function compileSolcContract(logger, file, allowedDirectories, remappings, solcConfig, callback) {
  let input = {};

  const filename = file.pluginPath ? path.join(file.pluginPath, file.filename) : file.filename;
  input[filename] = {content: file.parsedContent.replace(/\r\n/g, '\n'), path: filename};

  let jsonObj = {
    language: 'Solidity',
    sources: input,
    settings: {
      optimizer: {
        enabled: solcConfig['optimize'],
        runs: solcConfig['optimize-runs']
      },
      remappings,
      outputSelection: {
        '*': {
          '': ['ast'],
          '*': [
            'abi',
            'devdoc',
            'evm.bytecode',
            'evm.deployedBytecode',
            'evm.gasEstimates',
            'evm.legacyAssembly',
            'evm.methodIdentifiers',
            'metadata',
            'userdoc'
          ]
        }
      }
    }
  };

  const command = `solc --standard-json --allow-paths ${allowedDirectories.join(',')}`;

  shelljs.ShellString(JSON.stringify(jsonObj)).exec(command, {silent: true}, (code, stdout, stderr) => {
    if (stderr) {
      logger.warn(stderr);
    }

    if (code !== 0) {
      return callback(`solc exited with error code ${code}`);
    }

    if (!stdout) {
      return callback('solc execution returned nothing');
    }

    callback(null, stdout.replace(/\n/g, ''));
  });
}

function getSolcVersion(logger, callback) {
  shelljs.exec('solc --version', {silent: true}, (code, stdout, stderr) => {
    if (stderr) {
      logger.warn(stderr);
    }

    if (code !== 0) {
      return callback(`solc exited with error code ${code}`);
    }

    if (!stdout) {
      return callback('solc execution returned nothing');
    }

    const result = stdout.match(/(\d+.\d+.\d+)/);
    callback(null, result[1]);
  });
}

function compileSolc(embark, contractFiles, contractDirectories, cb) {
  if (!contractFiles || !contractFiles.length) {
    return cb();
  }

  const logger = embark.logger;
  const outputBinary = embark.pluginConfig.outputBinary;
  const outputDir = embark.config.buildDir + embark.config.contractDirectories[0];
  const solcConfig = embark.config.embarkConfig.options.solc;

  const solc = shelljs.which('solc');
  if (!solc) {
    logger.error('solc is not installed on your machine');
    logger.info('You can install it by following the instructions on: http://solidity.readthedocs.io/en/latest/installing-solidity.html');
    return cb('Compiler not installed');
  }

  logger.info("compiling solidity contracts with command line solc...");

  const allowedDirectories = contractFiles.map((contractFile) => path.join(process.cwd(), path.dirname(contractFile.path) + '/'))
    .filter((x, i, a) => a.indexOf(x) === i);
  // Add default contract paths
  allowedDirectories.push(
    path.join(process.cwd(), 'node_modules/'),
    path.join(process.cwd(), '.embark/contracts/')
  );

  const remappings = []; // Will get populated by compilations
  // Get content and remappings
  async.each(contractFiles, (file, eachCb) => {
    file.content(content => {
      file.parsedContent = content;
      const newRemappings = file.importRemappings.map((mapping) => `${mapping.prefix}=${mapping.target}`);
      newRemappings.forEach(newRemapping => {
        if (!remappings.includes(newRemapping)) {
          remappings.push(newRemapping);
        }
      });
      eachCb();
    });
  }, (err) => {
    if (err) {
      return cb(err);
    }
    let compiled_object = {};
    async.each(contractFiles,
      function(file, callback) {
        compileSolcContract(logger, file, allowedDirectories, remappings, solcConfig, (err, compileString) => {
          if (err) {
            return callback(err);
          }
          let json;
          try {
            json = JSON.parse(compileString);
          } catch (e) {
            logger.error(e.message || e);
            return callback(`Compiling ${file} returned an unreadable result`);
          }
          const contracts = json.contracts;

          if (json.errors) {
            let isError = false;
            json.errors.forEach(error => {
              if (error.severity === 'error') {
                isError = true;
                logger.error(error.formattedMessage);
              } else {
                logger.warn(error.formattedMessage);
              }
            });
            if (isError) {
              return callback(`Error while compiling ${file.filename}`);
            }
          }

          for (let contractFile in contracts) {
            for (let contractName in contracts[contractFile]) {
              let contract = contracts[contractFile][contractName];
              let filename = contractFile;
              const originalFilename = filename;
              for (let directory of contractDirectories) {
                let match = new RegExp("^" + directory);
                filename = filename.replace(match, '');
              }

              const className = contractName;

              compiled_object[className] = {};
              compiled_object[className].code = contract.evm.bytecode.object;
              compiled_object[className].runtimeBytecode = contract.evm.deployedBytecode.object;
              compiled_object[className].realRuntimeBytecode = contract.evm.deployedBytecode.object.slice(0, -68);
              compiled_object[className].swarmHash = contract.evm.deployedBytecode.object.slice(-68).slice(0, 64);
              compiled_object[className].gasEstimates = contract.evm.gasEstimates;
              compiled_object[className].functionHashes = contract.evm.methodIdentifiers;
              compiled_object[className].abiDefinition = contract.abi;
              compiled_object[className].filename = filename;
              compiled_object[className].originalFilename = originalFilename;
            }
          }

          callback();
        });
      },
      function(err) {
        cb(err, compiled_object);
        if (outputBinary) {
          embark.events.on("outputDone", function() {
            Object.keys(compiled_object).map(function(className, _index) {
              fs.writeFile(path.join(outputDir, className + ".bin"), compiled_object[className].code, (err) => {
                if (err) {
                  logger.error("Error writing binary file: " + JSON.stringify(err));
                }
              });
            });
          });
        }
      });
  });
}

module.exports = {
  compileSolc,
  compileSolcContract,
  getSolcVersion
};
