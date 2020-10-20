const R = require('ramda');

class InteractionModel {
    constructor(imodel) {
        this.version = imodel.version;
        this.invocationName = R.path(['interactionModel', 'languageModel', 'invocationName'], imodel);
        this.intentsList = R.path(['interactionModel', 'languageModel', 'intents'], imodel).map((intent) => new Intent(intent));
        this.typesList = R.path(['interactionModel', 'languageModel', 'types'], imodel).map((type) => new Type(type));
    }

    bfSamples() {
        const results = new Map();
        const nluFormat = [];
        for (const intent of this.intentsList) {
            const samplesResolver = new IntentSamplesResolver(intent, this.typesList);
            const expandedSamples = samplesResolver.expandSamples();
            const resList = expandedSamples.map((cell) => {
                return {
                    inputs: {
                        utterance: cell.stringValue
                    },
                    expected: [
                        {
                            intent: {
                                name: intent.name,
                                slots: R.clone(cell.slots)
                            }
                        }
                    ]
                };
            });
            results.set(intent.name, resList);
        }
        return results;
    }
}

class IntentSamplesResolver {
    constructor(intent, typesList) {
        this.intent = intent;
        this.types = typesList;
    }

    expandSamples() {
        let expandedSamples = [];
        for (let sample of this.intent.samples) {
            const slots = sample.match(/\{(.*?)\}/gm); // extract sample slot
            if (!slots) {
                expandedSamples.push({ stringValue: sample });
            }
            this.getSampleWithTypeValues(sample, slots, 0, expandedSamples, {});
        }
        return expandedSamples;
    }

    /**
     * DFS
     * @param {*} sample 
     * @param {*} slots 
     * @param {*} slotsPos 
     * @param {*} resultList 
     */
    getSampleWithTypeValues(sample, slots, slotsPos, resultList, toLeaf) {
        if (!slots || slotsPos >= slots.length) {
            return;
        }
        const slot = slots[slotsPos];
        const slotWithoutBracket = slot.substring(1, slot.length - 1);
        const targetType = this.getTypeBySlotName(slotWithoutBracket);
        const expandedTypes = targetType.bfTypes();
        for (const typeVal of expandedTypes) {
            toLeaf[slotWithoutBracket] = {};
            toLeaf[slotWithoutBracket].value = typeVal;
            const replacedSample = sample.replace(new RegExp(`${slot}`, 'gm'), typeVal);
            this.getSampleWithTypeValues(replacedSample, slots, slotsPos + 1, resultList, toLeaf);
            if (slotsPos === slots.length - 1) {
                resultList.push({
                    stringValue: replacedSample,
                    slots: toLeaf
                });
                toLeaf = {};
            }
        }
    }

    getTypeBySlotName(slot) {
        const slotType = R.find(R.propEq('name', slot))(this.intent.slots).type;
        const targetType = R.find(R.propEq('name', slotType))(this.types);
        return targetType;
    }

    findTypeByName(target) {
        for (const type of typeList) {
            if (type.name === target) {
                return type;
            }
        }
        throw `Failed to find ${target} type`;
    }
}

class Intent {
    constructor(intent) {
        this.name = R.path(['name'], intent);
        this.slots = R.path(['slots'], intent);
        this.samples = R.path(['samples'], intent);
    }
}

class Type {
    constructor(type) {
        this.name = R.path(['name'], type);
        this.entitiesList = R.path(['values'], type).map((entity) => new Entity(entity));
    }

    bfTypes() {
        let result = [];
        for (const entity of this.entitiesList) {
            result = R.concat(result, entity.synonyms);
            result.push(entity.value);
        }
        return result;
    }
}

class Entity {
    constructor(entity) {
        this.id = R.path(['id'], entity);
        this.value = R.path(['name', 'value'], entity);
        this.synonyms = R.path(['name', 'synonyms'], entity);
    }
}

module.exports = InteractionModel;
