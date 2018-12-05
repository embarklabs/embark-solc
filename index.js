/*global require, module*/
const Compiler = require("./lib/Compiler");

module.exports = (embark) => {
  if (embark.config.embarkConfig.versions.solc) {
    // Check solc version
    Compiler.getSolcVersion(embark.logger, (err, version) => {
      if (err) {
        embark.logger.error(err);
        embark.logger.error("Error getting solc's version. Will default back to Embark's commpiler");
        return;
      }
      const wantedVer = embark.config.embarkConfig.versions.solc.split('.').map(ver => parseInt(ver, 10));
      const currentVer = version.split('.').map(ver => parseInt(ver, 10));
      if (wantedVer[0] > currentVer[0] || wantedVer[1] > currentVer[1] || wantedVer[2] > currentVer[2]) {
        embark.logger.warn(`Current version of solc lower than version in embark.json`);
        embark.logger.warn(`Current: ${version} | Wanted: ${embark.config.embarkConfig.versions.solc}`);
        embark.logger.warn('Will default back to Embark\'s compiler');
        return;
      }

      embark.registerCompiler('.sol', (contractFiles, options, cb) => {
        if (!contractFiles || !contractFiles.length) {
          return cb();
        }
        Compiler.compileSolc(embark, contractFiles, embark.config.contractDirectories, cb);
      });
    });
  }
};
