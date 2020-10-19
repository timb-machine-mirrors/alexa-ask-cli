const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const nodemon = require('nodemon');
const CliError = require('@src/exceptions/cli-error');

module.exports = {
    getSkillInvocationInfo,
    initiateDebugging
};

function getPythonDebugAdapterPath() {
    let localDebuggerPath;
    const sitePkgUint8Array = execSync('python3 -c "import site; print(site.getsitepackages())"');
    let sitePkgLocationsStr = new TextDecoder('utf8').decode(sitePkgUint8Array);
    // Preprocessing the string to get site locations for searching
    // https://docs.python.org/3/library/site.html#site.getsitepackages gives an array of strings
    // eg: "['sitePkg-A', 'sitePkg-B']", and we need to preprocess to get each location
    sitePkgLocationsStr = sitePkgLocationsStr.replace('[', '').replace(']', '').trim();
    const sitePkgLocations = sitePkgLocationsStr.split(',');
    for (let sitePkgLocation of sitePkgLocations) {
        // Remove extra quotes and white spaces
        sitePkgLocation = sitePkgLocation.replace(/['"]+/g, '').trim();
        localDebuggerPath = path.join(sitePkgLocation, 'ask_sdk_local_debug', 'local_debugger_invoker.py');
        if (fs.existsSync(localDebuggerPath)) {
            break;
        }
    }
    return localDebuggerPath;
}

function invokeJavaDebugger(token, skillId, codeFolder, skillClass) {
    nodemon({
        exec: `cd ${codeFolder}; mvn exec:exec -Dexec.executable=java -Dexec.args=`
            + '"-classpath %classpath com.amazon.ask.localdebug.LocalDebuggerInvoker "'
            + `"--accessToken ${token} --skillId ${skillId} --skillStreamHandlerClass ${skillClass}"`,
        ext: 'java'
    });
}

function invokeAttachJavaDebugger(debugPort, token, skillId, codeFolder, skillClass) {
    nodemon({
        exec: `cd ${codeFolder}; mvn exec:exec -Dexec.executable=java -Dexec.args=`
        + `"-classpath %classpath -Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=${debugPort} "`
        + `"com.amazon.ask.localdebug.LocalDebuggerInvoker --accessToken ${token} --skillId ${skillId} "`
        + `"--skillStreamHandlerClass ${skillClass}"`,
        ext: 'java'
    });
}

function invokeNodeDebugger(token, skillId, codeFolder, skillFilePath, handlerName) {
    nodemon({
        script: `./${codeFolder}/node_modules/ask-sdk-local-debug/dist/LocalDebuggerInvoker.js`,
        args: ['--accessToken', `"${token}"`, '--skillId', skillId,
            '--handlerName', handlerName, '--skillEntryFile', path.join(process.cwd(), skillFilePath)]
    });
}

function invokeAttachNodeDebugger(debugPort, token, skillId, codeFolder, skillFilePath, handlerName) {
    nodemon({
        execMap: {
            js: `node --inspect-brk=${debugPort}`,
        },
        script: `./${codeFolder}/node_modules/ask-sdk-local-debug/dist/LocalDebuggerInvoker.js`,
        args: ['--accessToken', `"${token}"`, '--skillId', skillId,
            '--handlerName', handlerName, '--skillEntryFile', path.join(process.cwd(), skillFilePath)]
    });
}

function invokePythonDebugger(token, localDebuggerPath, skillId, handlerName, skillFilePath) {
    nodemon({
        execMap: {
            py: 'python3'
        },
        script: localDebuggerPath,
        args: ['--accessToken', `"${token}"`, '--skillId', skillId,
            '--skillHandler', handlerName, '--skillFilePath', skillFilePath],
        ext: 'py,json,txt'
    });
}

function invokeAttachPythonDebugger(debugPort, token, localDebuggerPath, skillId, handlerName, skillFilePath) {
    execSync('python3 -m pip install debugpy', { stdio: 'inherit' });
    nodemon({
        execMap: {
            py: `python3 -m debugpy --listen ${debugPort} --wait-for-client`
        },
        script: localDebuggerPath,
        args: ['--accessToken', `"${token}"`, '--skillId', skillId,
            '--skillHandler', handlerName, '--skillFilePath', skillFilePath],
        ext: 'py,json,txt'
    });
}

function getSkillInvocationInfo(handler, runtime, isHosted) {
    if (runtime.includes('node') || runtime.includes('python')) {
        if (isHosted) {
            if (runtime.includes('node')) {
                return { handlerName: 'handler', skillFileName: 'index' };
            }
            if (runtime.includes('python')) {
                return { handlerName: 'lambda_handler', skillFileName: 'lambda_function' };
            }
        }
        const handlerInfo = handler.split('.');
        const handlerName = handlerInfo.pop();
        const skillFileName = handlerInfo.join(path.delimiter);
        return { handlerName, skillFileName };
    }
    if (runtime.includes('java')) {
        return { handlerName: handler };
    }
}

function initiateDebugging(runtime, skillInvocationInfo, skillCodeFolderName, waitForAttach, debugPort, token, skillId) {
    if (runtime.includes('python')) {
        const localDebuggerPath = getPythonDebugAdapterPath();
        if (localDebuggerPath === undefined) {
            throw new CliError('Install ask-sdk-local-debug');
        }
        if (waitForAttach) {
            invokeAttachPythonDebugger(debugPort, token, localDebuggerPath, skillId, skillInvocationInfo.handlerName,
                `${skillCodeFolderName}/${skillInvocationInfo.skillFileName}.py`);
        } else {
            invokePythonDebugger(token, localDebuggerPath, skillId, skillInvocationInfo.handlerName,
                `${skillCodeFolderName}/${skillInvocationInfo.skillFileName}.py`);
        }
    } else if (runtime.includes('node')) {
        if (waitForAttach) {
            invokeAttachNodeDebugger(debugPort, token, skillId, skillCodeFolderName,
                `${skillCodeFolderName}/${skillInvocationInfo.skillFileName}.js`, skillInvocationInfo.handlerName);
        } else {
            invokeNodeDebugger(token, skillId, skillCodeFolderName,
                `${skillCodeFolderName}/${skillInvocationInfo.skillFileName}.js`, skillInvocationInfo.handlerName);
        }
    } else if (runtime.includes('java')) {
        if (waitForAttach) {
            invokeAttachJavaDebugger(token, skillId, skillCodeFolderName, skillInvocationInfo.handlerName);
        } else {
            invokeJavaDebugger(token, skillId, skillCodeFolderName, skillInvocationInfo.handlerName);
        }
    }
}
