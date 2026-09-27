'use strict';

// A refusal is an expected "no" with a message written for whoever called the verb (often the
// model), as opposed to a bug. invoke() turns it into { success: false, error } and logs it.
class Refusal extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'Refusal';
    this.details = details;
  }
}

module.exports = { Refusal };
