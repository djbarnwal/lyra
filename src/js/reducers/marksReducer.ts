import {Map} from 'immutable';
import {ActionType, getType} from 'typesafe-actions';
import * as markActions from '../actions/markActions';
import * as sceneActions from '../actions/sceneActions';
import {MarkRecord, MarkState} from '../store/factory/Mark';

const str   = require('../util/immutable-utils').str;

const dl = require('datalib');
const ACTIONS = require('../actions/Names');
const ns = require('../util/ns');
const propSg = require('../util/prop-signal');
const immutableUtils = require('../util/immutable-utils');
const get = immutableUtils.get;
const getIn = immutableUtils.getIn;
const set = immutableUtils.set;
const setIn = immutableUtils.setIn;
const deleteKeyFromMap = immutableUtils.deleteKeyFromMap;
const ensureValuePresent = immutableUtils.ensureValuePresent;
const ensureValueAbsent = immutableUtils.ensureValueAbsent;

// Helper reducer to add a mark to the store. Runs the mark through a method to
// convert property values into signal references before setting the mark
// within the store.
// "state" is the marks store state; "action" is an object with a numeric
// `._id`, string `.name`, and object `.props` defining the mark to be created.
function makeMark(action: ActionType<typeof markActions.addMark> | ActionType<typeof sceneActions.createScene>) {
  const def: MarkRecord = action.payload.props;
  const props = def.encode && def.encode.update;
  return def.merge({
    encode: {
      update: propSg.convertValuesToSignals(props, def.type, action.meta)
    }
  });
}

// Helper reducer to configure a parent-child relationship between two marks.
// "state" is the marks store state; "action" is an object with a numeric
// `.childId` and either a numeric `.parentId` (for setting a parent) or `null`
// (for clearing a parent, e.g. when removing a mark).
function setParentMark(state: MarkState, params: {parentId: number, childId: number}): MarkState {
  const {parentId, childId} = params;
  // Nothing to do if no child is provided
  if (typeof childId === 'undefined') {
    return state;
  }
  const child = state.get(str(childId));
  if (!child) {
    return state;
  }

  const existingParentId = child.get('_parent');

  // If we're deleting a parent but there isn't one to begin with, do nothing
  // (`== null` is used to catch both `undefined` and explicitly `null`)
  if (existingParentId == null && !parentId) {
    return state;
  }

  const existingParent = state.get(str(existingParentId));
  const newParent = parentId ? state.get(str(parentId)) : parentId;

  // Clearing a mark's parent reference
  if (newParent === null) {
    // Second, ensure the child ID has been removed from the parent's marks
    return ensureValueAbsent(
      // First, null out the child's parent reference
      state.setIn([str(childId), '_parent'], null),
      existingParentId + '.marks',
      childId
    );
  }

  // Moving a mark from one parent to another
  if (existingParent && newParent) {
    // Finally, make sure the child ID is present in the new parent's marks array
    return ensureValuePresent(
      // Next, remove the child ID from the old parent's marks
      ensureValueAbsent(
        // First, update the child's _parent pointer to target the new parent
        state.setIn([str(childId), '_parent'], parentId),
        existingParentId + '.marks',
        childId
      ),
      parentId + '.marks',
      childId
    );
  }

  // Setting a parent of a previously-parentless mark
  return ensureValuePresent(
    // First, update the child's _parent pointer to target the new parent
    state.setIn([str(childId), '_parent'], parentId),
    parentId + '.marks',
    childId
  );
}

/**
 * Move an Axis or Legend from one group to another
 *
 * @param {Object} state - An Immutable state object
 * @param {Object} action - An action object
 * @param {number} action.id - The ID of the Axis or Legend to move
 * @param {number} [action.oldGroupId] - The ID of the group to move it from
 * @param {number} action.groupId - The ID of the group to move it to
 * @param {string} collection - The collection to which this mark belongs,
 * either "legends" or "axes"
 * @returns {Object} A new Immutable state with the requested changes
 */
/* eslint no-unused-vars:0 */
function moveChildToGroup(state, action, collection) {
  const oldGroupCollectionPath = action.oldGroupId + '.' + collection,
      newGroupCollectionPath = action.groupId + '.' + collection;

  // Simple case: add to the new
  if (!action.oldGroupId) {
    return ensureValuePresent(state, newGroupCollectionPath, action.id);
  }

  // Remove from the old and add to the new
  return ensureValuePresent(
    ensureValueAbsent(state, oldGroupCollectionPath, action.id),
    newGroupCollectionPath,
    action.id
  );
}

/**
 * Main marks reducer function, which generates a new state for the marks
 * property store based on the changes specified by the dispatched action object.
 *
 * @param {Object} state - An Immutable.Map state object
 * @param {Object} action - A redux action object
 * @returns {Object} A new Immutable.Map with the changes specified by the action
 */
function marksReducer(state: MarkState, action: ActionType<typeof markActions> | ActionType<typeof sceneActions.createScene>): MarkState {
  if (typeof state === 'undefined') {
    return Map();
  }

  const markId = action.meta;

  if (action.type === getType(sceneActions.createScene)) {
    return state.set(str(markId), makeMark(action));
  }

  if (action.type === getType(markActions.addMark)) {
    // Make the mark and .set it at the provided ID, then pass it through a
    // method that will check to see whether the mark needs to be added as
    // a child of another mark
    return setParentMark( state.set(str(markId), makeMark(action)), {
      parentId: action.payload.props ? action.payload.props._parent : null,
      childId: markId
    });
  }

  if (action.type === getType(markActions.baseDeleteMark)) {
    return deleteKeyFromMap(setParentMark(state, {
      childId: markId,
      parentId: null
    }), markId);
  }

  if (action.type === getType(markActions.setParent)) {
    return setParentMark(state, {
      parentId: action.payload,
      childId: markId
    });
  }

  if (action.type === getType(markActions.updateMarkProperty)) {
    return state.setIn([str(markId), action.payload.property],
      action.payload.value);
  }

  if (action.type === getType(markActions.setMarkVisual)) {
    return state.setIn([str(markId), 'properties', 'update', action.payload.property], action.payload.def);
  }

  if (action.type === getType(markActions.disableMarkVisual)) {
    return state.setIn([str(markId), 'properties', 'update', action.payload, '_disabled'], true);
  }

  if (action.type === getType(markActions.resetMarkVisual)) {
    const markType = state.getIn([str(markId), 'type']);
    const property = action.payload;

    return state.setIn([str(markId), 'properties', 'update', property],
        {signal: propSg(markId, markType, property)});
  }

  if (action.type === getType(markActions.setMarkExtent)) {
    return state.setIn([str(markId), 'properties', 'update', action.payload.oldExtent, '_disabled'], true)
                .setIn([str(markId), 'properties', 'update', action.payload.newExtent, '_disabled'], false);
  }

  if (action.type === getType(markActions.setVlUnit)) {
    return state.setIn([str(markId), '_vlUnit'], action.payload);
  }

  if (action.type === getType(markActions.bindScale)) {
    return state.setIn([str(markId), 'properties', 'update', action.payload.property, 'scale'], action.payload.scaleId);
  }

  // TODO(jzong, al) blocked on scaleActions refactor

  if (action.type === ACTIONS.ADD_SCALE_TO_GROUP) {
    return ensureValuePresent(state, action.groupId + '.scales', action.scaleId);
  }

  if (action.type === ACTIONS.ADD_AXIS_TO_GROUP) {
    return ensureValuePresent(state, action.groupId + '.axes', action.axisId);
  }

  if (action.type === ACTIONS.ADD_LEGEND_TO_GROUP) {
    return ensureValuePresent(state, action.groupId + '.legends', action.legendId);
  }

  if (action.type === ACTIONS.DELETE_GUIDE) {
    state = ensureValueAbsent(state, action.groupId + '.axes', action.id);
    return ensureValueAbsent(state, action.groupId + '.legends', action.id);
  }

  return state;
}

module.exports = marksReducer;