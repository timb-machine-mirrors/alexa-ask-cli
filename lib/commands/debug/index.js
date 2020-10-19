const path = require('path');
const SmapiClient = require('@src/clients/smapi-client');
const { AbstractCommand } = require('@src/commands/abstract-command');
const optionModel = require('@src/commands/option-model');
const AuthorizationController = require('@src/controllers/authorization-controller');
const ResourcesConfig = require('@src/model/resources-config');
const CONSTANTS = require('@src/utils/constants');
const profileHelper = require('@src/utils/profile-helper');
const jsonView = require('@src/view/json-view');
const fs = require('fs');
const stringUtils = require('@src/utils/string-utils');
const helper = require('./helper');

class DebugCommand extends AbstractCommand {
    name() {
        return 'debug';
    }

    description() {
        return 'debug the skill';
    }

    requiredOptions() {
        return [];
    }

    optionalOptions() {
        return ['skill-id', 'profile', 'debug-port', 'wait-for-attach', 'skillCodeRegion'];
    }

    handle(cmd, cb) {
        const debugPort = cmd.debugPort || 5000;
        const profile = profileHelper.runtimeProfile(cmd.profile);
        const skillCodeRegion = cmd.skillCodeRegion || 'default';
        const smapiClient = new SmapiClient({
            profile,
            doDebug: cmd.debug
        });
        const authorizationController = new AuthorizationController({
            auth_client_type: 'LWA',
            doDebug: this.doDebug
        });

        authorizationController.tokenRefreshAndRead(profile, (tokenErr, token) => {
            if (tokenErr) {
                return cb(tokenErr);
            }
            new ResourcesConfig(path.join(process.cwd(), CONSTANTS.FILE_PATH.ASK_RESOURCES_JSON_CONFIG));
            const skillId = ResourcesConfig.getInstance().getSkillId(profile);
            if (this._filterAlexaHostedSkill(profile)) {
                smapiClient.skill.alexaHosted.getAlexaHostedSkillMetadata(skillId, (err, response) => {
                    if (err) {
                        return cb(err);
                    }
                    if (response.statusCode >= 300) {
                        const error = jsonView.toString(response.body);
                        return cb(error);
                    }
                    const { runtime } = response.body.alexaHosted;
                    helper.initiateDebugging(runtime, helper.getSkillInvocationInfo(null, runtime, true),
                        'lambda', cmd.waitForAttach, debugPort, token, skillId);
                });
            } else {
                const skillCodeFolderName = ResourcesConfig.getInstance().getCodeSrcByRegion(profile, skillCodeRegion);
                if (!stringUtils.isNonBlankString(skillCodeFolderName)) {
                    throw `Invalid code setting in region ${skillCodeRegion}. "src" must be set if you want to run `
                    + 'the skill code with skill package.';
                }
                if (!fs.existsSync(skillCodeFolderName)) {
                    throw `Invalid code setting in region ${skillCodeRegion}. File doesn't exist for code src: ${skillCodeFolderName}.`;
                }
                const { runtime, handler } = ResourcesConfig.getInstance().getSkillInfraUserConfig(profile);
                if (!stringUtils.isNonBlankString(runtime)) {
                    throw 'Missing runtime info in UserConfig.';
                }
                if (!stringUtils.isNonBlankString(handler)) {
                    throw 'Missing handler info in UserConfig.';
                }
                helper.initiateDebugging(runtime, helper.getSkillInvocationInfo(handler, runtime, false),
                    skillCodeFolderName, cmd.waitForAttach, debugPort, token, skillId);
            }
        });
    }

    _filterAlexaHostedSkill(profile) {
        return (ResourcesConfig.getInstance().getSkillInfraType(profile) === CONSTANTS.DEPLOYER_TYPE.HOSTED.NAME);
    }
}

module.exports = DebugCommand;
module.exports.createCommand = new DebugCommand(optionModel).createCommand();
