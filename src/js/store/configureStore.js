'use strict';
var thunkMiddleware = require('redux-thunk').default;
var redux = require('redux');
var createStore = redux.createStore;
var applyMiddleware = redux.applyMiddleware;
var createRecNReplayMiddleware = require('redux-action-replay-middleware').default;

// reducer/index.js returns combinedReducers();
var rootReducer = require('../reducers');

module.exports = function configureStore(initialState) {
  return createStore(rootReducer, initialState, applyMiddleware(
    // redux-thunk lets us dispatch() functions to create async or multi-stage actions
    thunkMiddleware,
    createRecNReplayMiddleware()
  ));
};
