import {getStatusText} from "http-status-codes";
import * as HttpStatus from 'http-status-codes';

/**
 * XXX(@czyk): I assume there is already a proper lib available to do this..?
 */

class ErrorWithName extends Error{

    constructor(name?: string, message?: string) {
        super(message);
        this.name = name || "UnknownError";
        this.message = (message || "");
    }
}

export class ErrorWithNameAndCode extends ErrorWithName{

    private code;

    constructor(name?: string, message?: string, code?: number) {
        super(name, message);
        this.code = code;
    }
}

class ErrorWithCode extends ErrorWithNameAndCode{

    constructor(code?: number, message?: string) {
        super(getStatusText(code), message, code);
    }
}

export class UnauthorizedError extends ErrorWithCode{

    constructor(message?: string) {
        super(HttpStatus.NOT_FOUND, message, );
    }
}

export class NotFoundError extends ErrorWithCode{

    constructor(message?: string) {
        super(HttpStatus.NOT_FOUND, message);
    }
}
