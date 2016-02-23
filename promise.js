function isFunction(value){return typeof value === 'function';}


function isPromiseLike(obj) {
    return obj && isFunction(obj.then);
}
/**
 * Constructs a promise manager.
 *
 * @param {function(Function)} nextTick Function for executing functions in the next turn.
 * @param {function(...*)} exceptionHandler Function into which unexpected exceptions are passed for
 *     debugging purposes.
 * @returns {object} Promise manager.
 */
function qFactory(nextTick, exceptionHandler) {

    /**
     * @ngdoc method
     * @name $q#defer
     * @kind function
     *
     * @description
     * Creates a `Deferred` object which represents a task which will finish in the future.
     *
     * @returns {Deferred} Returns a new instance of deferred.
     */
    var defer = function() {
        var pending = [],
            value, deferred;

        deferred = {

            resolve: function(val) {
                if (pending) {
                    var callbacks = pending;
                    pending = undefined;
                    value = ref(val);

                    if (callbacks.length) {
                        nextTick(function() {
                            var callback;
                            for (var i = 0, ii = callbacks.length; i < ii; i++) {
                                callback = callbacks[i];
                                value.then(callback[0], callback[1], callback[2]);
                            }
                        });
                    }
                }
            },


            reject: function(reason) {
                deferred.resolve(createInternalRejectedPromise(reason));
            },


            notify: function(progress) {
                if (pending) {
                    var callbacks = pending;

                    if (pending.length) {
                        nextTick(function() {
                            var callback;
                            for (var i = 0, ii = callbacks.length; i < ii; i++) {
                                callback = callbacks[i];
                                callback[2](progress);
                            }
                        });
                    }
                }
            },


            promise: {
                then: function(callback, errback, progressback) {
                    var result = defer();

                    var wrappedCallback = function(value) {
                        try {
                            result.resolve((isFunction(callback) ? callback : defaultCallback)(value));
                        } catch(e) {
                            result.reject(e);
                            exceptionHandler(e);
                        }
                    };

                    var wrappedErrback = function(reason) {
                        try {
                            result.resolve((isFunction(errback) ? errback : defaultErrback)(reason));
                        } catch(e) {
                            result.reject(e);
                            exceptionHandler(e);
                        }
                    };

                    var wrappedProgressback = function(progress) {
                        try {
                            result.notify((isFunction(progressback) ? progressback : defaultCallback)(progress));
                        } catch(e) {
                            exceptionHandler(e);
                        }
                    };

                    if (pending) {
                        pending.push([wrappedCallback, wrappedErrback, wrappedProgressback]);
                    } else {
                        value.then(wrappedCallback, wrappedErrback, wrappedProgressback);
                    }

                    return result.promise;
                },

                "catch": function(callback) {
                    return this.then(null, callback);
                },

                "finally": function(callback) {

                    function makePromise(value, resolved) {
                        var result = defer();
                        if (resolved) {
                            result.resolve(value);
                        } else {
                            result.reject(value);
                        }
                        return result.promise;
                    }

                    function handleCallback(value, isResolved) {
                        var callbackOutput = null;
                        try {
                            callbackOutput = (callback ||defaultCallback)();
                        } catch(e) {
                            return makePromise(e, false);
                        }
                        if (isPromiseLike(callbackOutput)) {
                            return callbackOutput.then(function() {
                                return makePromise(value, isResolved);
                            }, function(error) {
                                return makePromise(error, false);
                            });
                        } else {
                            return makePromise(value, isResolved);
                        }
                    }

                    return this.then(function(value) {
                        return handleCallback(value, true);
                    }, function(error) {
                        return handleCallback(error, false);
                    });
                }
            }
        };

        return deferred;
    };


    var ref = function(value) {
        if (isPromiseLike(value)) return value;
        return {
            then: function(callback) {
                var result = defer();
                nextTick(function() {
                    result.resolve(callback(value));
                });
                return result.promise;
            }
        };
    };


    /**
     * @ngdoc method
     * @name $q#reject
     * @kind function
     *
     * @description
     * Creates a promise that is resolved as rejected with the specified `reason`. This api should be
     * used to forward rejection in a chain of promises. If you are dealing with the last promise in
     * a promise chain, you don't need to worry about it.
     *
     * When comparing deferreds/promises to the familiar behavior of try/catch/throw, think of
     * `reject` as the `throw` keyword in JavaScript. This also means that if you "catch" an error via
     * a promise error callback and you want to forward the error to the promise derived from the
     * current promise, you have to "rethrow" the error by returning a rejection constructed via
     * `reject`.
     *
     * ```js
     *   promiseB = promiseA.then(function(result) {
   *     // success: do something and resolve promiseB
   *     //          with the old or a new result
   *     return result;
   *   }, function(reason) {
   *     // error: handle the error if possible and
   *     //        resolve promiseB with newPromiseOrValue,
   *     //        otherwise forward the rejection to promiseB
   *     if (canHandle(reason)) {
   *      // handle the error and recover
   *      return newPromiseOrValue;
   *     }
   *     return $q.reject(reason);
   *   });
     * ```
     *
     * @param {*} reason Constant, message, exception or an object representing the rejection reason.
     * @returns {Promise} Returns a promise that was already resolved as rejected with the `reason`.
     */
    var reject = function(reason) {
        var result = defer();
        result.reject(reason);
        return result.promise;
    };

    var createInternalRejectedPromise = function(reason) {
        return {
            then: function(callback, errback) {
                var result = defer();
                nextTick(function() {
                    try {
                        result.resolve((isFunction(errback) ? errback : defaultErrback)(reason));
                    } catch(e) {
                        result.reject(e);
                        exceptionHandler(e);
                    }
                });
                return result.promise;
            }
        };
    };


    /**
     * @ngdoc method
     * @name $q#when
     * @kind function
     *
     * @description
     * Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise.
     * This is useful when you are dealing with an object that might or might not be a promise, or if
     * the promise comes from a source that can't be trusted.
     *
     * @param {*} value Value or a promise
     * @returns {Promise} Returns a promise of the passed value or promise
     */
    var when = function(value, callback, errback, progressback) {
        var result = defer(),
            done;

        var wrappedCallback = function(value) {
            try {
                return (isFunction(callback) ? callback : defaultCallback)(value);
            } catch (e) {
                exceptionHandler(e);
                return reject(e);
            }
        };

        var wrappedErrback = function(reason) {
            try {
                return (isFunction(errback) ? errback : defaultErrback)(reason);
            } catch (e) {
                exceptionHandler(e);
                return reject(e);
            }
        };

        var wrappedProgressback = function(progress) {
            try {
                return (isFunction(progressback) ? progressback : defaultCallback)(progress);
            } catch (e) {
                exceptionHandler(e);
            }
        };

        nextTick(function() {
            ref(value).then(function(value) {
                if (done) return;
                done = true;
                result.resolve(ref(value).then(wrappedCallback, wrappedErrback, wrappedProgressback));
            }, function(reason) {
                if (done) return;
                done = true;
                result.resolve(wrappedErrback(reason));
            }, function(progress) {
                if (done) return;
                result.notify(wrappedProgressback(progress));
            });
        });

        return result.promise;
    };


    function defaultCallback(value) {
        return value;
    }


    function defaultErrback(reason) {
        return reject(reason);
    }


    /**
     * @ngdoc method
     * @name $q#all
     * @kind function
     *
     * @description
     * Combines multiple promises into a single promise that is resolved when all of the input
     * promises are resolved.
     *
     * @param {Array.<Promise>|Object.<Promise>} promises An array or hash of promises.
     * @returns {Promise} Returns a single promise that will be resolved with an array/hash of values,
     *   each value corresponding to the promise at the same index/key in the `promises` array/hash.
     *   If any of the promises is resolved with a rejection, this resulting promise will be rejected
     *   with the same rejection value.
     */
    function all(promises) {
        var deferred = defer(),
            counter = 0,
            results = isArray(promises) ? [] : {};

        forEach(promises, function(promise, key) {
            counter++;
            ref(promise).then(function(value) {
                if (results.hasOwnProperty(key)) return;
                results[key] = value;
                if (!(--counter)) deferred.resolve(results);
            }, function(reason) {
                if (results.hasOwnProperty(key)) return;
                deferred.reject(reason);
            });
        });

        if (counter === 0) {
            deferred.resolve(results);
        }

        return deferred.promise;
    }

    return {
        defer: defer,
        reject: reject,
        when: when,
        all: all
    };
}

var $q = qFactory(setTimeout, function(e) {
    console.log(e);
});

var p = null;

var Promise = {};

Promise.resolve = function (val) {
    var defer = $q.defer();
    defer.resolve(val);
    return defer.promise;
};

//var p1 = Promise.resolve();
//console.log(p1);
//var p2 = p1.then(function(response) {
//    var defer = $q.defer();
//    setTimeout(function(){
//        console.log(response);
//        defer.resolve('string-a');
//    }, 2000);
//    return (p = defer.promise);
//});
//console.log(p2);
//var p3 = p2.then(function(response) {
//    console.log(response);
//    console.log(p);
//    console.log("p === p2" + p === p2);
//    return response + '-b';
//});
//console.log(p2);
//var p4 = p3.then(function(response) {
//    console.log(response);
//    return response + '-c';
//});
//console.log(p3);
//console.log('string append done');

var defer = $q.defer();
defer.promise.then(function(value) {
    return value + '_ 001';
}, function(reason) {
    var result = $q.defer();
    if(reason === 'error') {
        setTimeout(function() {
            result.resolve('good');
        });
    }
    debugger;
    return result.promise;
}).then(function(value) {
    console.log(value + '_002');
    return value + '_002';
}, function(reason) {
    console.log(reason);
});


//defer.resolve('000');
defer.reject('error');

//如果在执行期间返回了一个promise，接下来将怎么执行呢？会将这个promise当做一个结果，调用下一个promise的resolve方法，
//下一个promise的resolve的方法被调用了，会把当前promose要通知的函数callback，交给返回的promise去通知

