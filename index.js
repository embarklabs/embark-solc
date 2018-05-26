/*global require, module*/
const Compiler = require("./lib/Compiler");

module.exports = (embark) => {
	embark.registerCompiler('.sol', compileSolc);
	function compileSolc(contractFiles, cb) {
		if(!contractFiles || !contractFiles.length) {
			return cb();
		}
		Compiler.compileSolc(embark.logger, contractFiles, cb);
	}
};
