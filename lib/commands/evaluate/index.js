const path = require('path');
const fs = require('fs-extra');

const { AbstractCommand } = require('@src/commands/abstract-command');
const optionModel = require('@src/commands/option-model');
const CliError = require('@src/exceptions/cli-error');
const ResourcesConfig = require('@src/model/resources-config');
const CONSTANTS = require('@src/utils/constants');
const profileHelper = require('@src/utils/profile-helper');
const Messenger = require('@src/view/messenger');
const stringUtils = require('@src/utils/string-utils');

const helper = require('./helper');
const InteractionModel = require('./interaction-model-class');

class EvaluateCommand extends AbstractCommand {
    name() {
        return 'eval';
    }

    description() {
        return 'evaluate your local language model';
    }

    requiredOptions() {
        return [];
    }

    optionalOptions() {
        return ['locale', 'profile', 'debug'];
    }

    handle(cmd, cb) {
        const profile = profileHelper.runtimeProfile(cmd.profile);
        new ResourcesConfig(path.join(process.cwd(), CONSTANTS.FILE_PATH.ASK_RESOURCES_JSON_CONFIG));
        // generate nlu evaluations
        const iModelJson = fs.readJSONSync(path.join(process.cwd(),
            ResourcesConfig.getInstance().getSkillMetaSrc(profile), 'interactionModels', 'custom', `${cmd.locale}.json`));
        const im = new InteractionModel(iModelJson);
        const samplesMap = im.bfSamples();
        for (const [k, v] of samplesMap.entries()) {
            if (k.startsWith('AMAZON.')) {
                continue;
            }
            const filePath = path.join('test', 'eval', `${k}.json`);
            fs.outputJsonSync(filePath, {data: v}, { spaces: 2 });
        }
        cb();
        // call nlu evaluations

    }
}

module.exports = EvaluateCommand;
module.exports.createCommand = new EvaluateCommand(optionModel).createCommand();
