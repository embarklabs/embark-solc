/*global require, module*/
const Compiler = require("./lib/Compiler");
const semver = require('semver');

module.exports = (embark) => {
  if (embark.config.embarkConfig.versions.solc) {
    const versionPromise = new Promise(function(resolve, reject) {
      // Check solc version
      Compiler.getSolcVersion(embark.logger, (err, version) => {
        if (err) {
          embark.logger.error(err);
          embark.logger.error("Error getting solc's version. Will default back to Embark's compiler");
          return reject(err);
        }
        if (semver.lt(version, embark.config.embarkConfig.versions.solc)) {
          embark.logger.warn(`Current version of solc lower than version in embark.json`);
          embark.logger.warn(`Current: ${version} | Wanted: ${embark.config.embarkConfig.versions.solc}`);
          embark.logger.warn('Will default back to Embark\'s compiler');
          return reject(new Error('Bad version'));
        }
        resolve();
      });
    });

    embark.registerCompiler('.sol', (contractFiles, options, cb) => {
      if (!contractFiles || !contractFiles.length) {
        return cb();
      }
      versionPromise.then(() => {
        Compiler.compileSolc(embark, contractFiles, embark.config.contractDirectories, cb);
      }).catch(_e => {
        // Need to default to Embark's compiler
        cb(null, false);
      });
    });

  }
};
