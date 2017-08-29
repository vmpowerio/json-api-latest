import ResourceTypeRegistry from '../ResourceTypeRegistry';
// This is typescript voodoo. Sealed response actually refers to the *un*sealed
// class, but it's the appropriate type name in the sense that that same type is
// used as the return value when a *sealed* response is created through ValueObject()
// because TS doesn't have the concept of a Sealed type.
import Response, { Response as SealedResponse } from "../types/HTTP/Response";
import Document from "../types/Document";
import Collection from "../types/Collection";
import APIError from "../types/APIError";

export { SealedResponse };

import * as requestValidators from "../steps/http/validate-request";
import negotiateContentType from "../steps/http/content-negotiation/negotiate-content-type";
import validateContentType from "../steps/http/content-negotiation/validate-content-type";

import labelToIds from "../steps/pre-query/label-to-ids";
import parseRequestPrimary from "../steps/pre-query/parse-request-primary";
import validateRequestDocument from "../steps/pre-query/validate-document";
import validateRequestResources from "../steps/pre-query/validate-resources";
import applyTransform from "../steps/apply-transform";

import makeGET from "../steps/make-query/make-get";
import doGET from "../steps/do-query/do-get";

import makePOST from "../steps/make-query/make-post";
import doPOST from "../steps/do-query/do-post";

import makePATCH from "../steps/make-query/make-patch";
import doPATCH from "../steps/do-query/do-patch";

import makeDELETE from "../steps/make-query/make-delete";
import doDELETE from "../steps/do-query/do-delete";

class APIController {
  private registry: ResourceTypeRegistry;

  constructor(registry: ResourceTypeRegistry) {
    this.registry = registry;
  }

  /**
   * @param {Request} request The Request this controller will use to generate
   *    the Response.
   * @param {Object} frameworkReq This should be the request object generated by
   *    the framework that you're using. But, really, it can be absolutely
   *    anything, as this controller won't use it for anything except passing it
   *    to user-provided functions that it calls (like transforms and id mappers).
   * @param {Object} frameworkRes Theoretically, the response objcet generated
   *     by your http framework but, like with frameworkReq, it can be anything.
   */
  async handle(request, frameworkReq, frameworkRes) {
    const response = new Response();
    const registry = this.registry;

    // Kick off the chain for generating the response.
    try {
      // check that a valid method is in use
      await requestValidators.checkMethod(request);

      // throw if the body is supposed to be present but isn't (or vice-versa).
      await requestValidators.checkBodyExistence(request);

      // Try to negotiate the content type (may fail, and we may need to
      // deviate from the negotiated value if we have to return an error
      // body, rather than our expected response).
      response.contentType = await negotiateContentType(
        request.accepts, ["application/vnd.api+json"]
      );

      // No matter what, though, we're varying on Accept. See:
      // https://github.com/ethanresnick/json-api/issues/22
      response.headers.vary = "Accept";


      // If the type requested in the endpoint hasn't been registered, we 404.
      if(!registry.hasType(request.type)) {
        throw new APIError(404, undefined, `${request.type} is not a valid type.`);
      }

      // If the request has a body, validate it and parse its resources.
      if(request.hasBody) {
        await validateContentType(request, (<any>this.constructor).supportedExt);
        await validateRequestDocument(request.body);

        const parsedPrimary = await parseRequestPrimary(
          request.body.data, request.aboutRelationship
        );

        // validate the request's resources.
        if(!request.aboutRelationship) {
          await validateRequestResources(request.type, parsedPrimary, registry);
        }

        request.primary = await applyTransform(
          parsedPrimary, "beforeSave", registry, frameworkReq, frameworkRes
        );
      }

      // Map label to idOrIds, if applicable.
      if(request.idOrIds && request.allowLabel) {
        const mappedLabel = await labelToIds(
          request.type, request.idOrIds, registry, frameworkReq
        );

        // set the idOrIds on the request context
        request.idOrIds = mappedLabel;

        // if our new ids are null/undefined or an empty array, we can set
        // the primary resources too! (Note: one could argue that we should
        // 404 rather than return null when the label matches no ids.)
        const mappedIsEmptyArray = Array.isArray(mappedLabel) && !mappedLabel.length;

        if(mappedLabel === null || mappedLabel === undefined || mappedIsEmptyArray) {
          response.primary = (mappedLabel) ? new Collection() : null;
        }
      }

      // Add an empty meta object to start. Some of our methods below may fill this in.
      response.meta = {};

      // Actually fulfill the request!
      // If we've already populated the primary resources, which is possible
      // because the label may have mapped to no id(s), we don't need to query.
      if(typeof response.primary === "undefined") {
        switch(request.method) {
          case "get":
            await doGET(request, response, registry, makeGET(request, registry));
            break;

          case "post":
            await doPOST(request, response, registry, makePOST(request, registry));
            break;

          case "patch":
            await doPATCH(request, response, registry, makePATCH(request, registry));
            break;

          case "delete":
            await doDELETE(request, response, registry, makeDELETE(request, registry));
        }
      }
    }

    // Add errors to the response converting them, if necessary, to
    // APIError instances first. Might be needed if, e.g., the error was
    // unexpected (and so uncaught and not transformed) in one of prior steps
    // or the user couldn't throw an APIError for compatibility with other code.
    catch (errors) {
      const errorsArr = Array.isArray(errors) ? errors : [errors];
      const apiErrors = errorsArr.map(APIError.fromError);

      // Leave the error response's content type as JSON if we negotiated
      // for that, but otherwise force it to JSON API, since that's the only
      // other error format we know how to generate.
      if(response.contentType !== "application/json") {
        response.contentType = "application/vnd.api+json";
      }

      // Set the other key fields on the response
      response.errors = response.errors.concat(apiErrors);
      //console.log("API CONTROLLER ERRORS", errorsArr[0], errorsArr[0].stack);
    }

    // If we have errors, which could have come from prior steps not just
    // throwing, return here and don't bother with transforms.
    if(response.errors.length) {
      response.status = pickStatus(response.errors.map((v) => Number(v.status)));
      response.body = new Document(response.errors).get(true);
      return response;
    }

    // apply transforms pre-send
    response.primary = await applyTransform(
      response.primary, "beforeRender", registry, frameworkReq, frameworkRes
    );

    response.included = await applyTransform(
      response.included, "beforeRender", registry, frameworkReq, frameworkRes
    );

    if(response.status !== 204) {
      // TODO: response.primary could be undefined here, from the transform
      // or the doMETHOD functions above. How to handle that?
      response.body = new Document(
        <any>response.primary, response.included,
        response.meta, registry.urlTemplates(), request.uri
      ).get(true);
    }

    return response;
  }

  /**
   * Builds a response from errors. Allows errors that occur outside of the
   * library to be handled and returned in JSON API-compiant fashion.
   *
   * @param {} errors Error or array of errors
   * @param {string} requestAccepts Request's Accepts header
   */
  static responseFromExternalError(errors: Error | APIError | Error[] | APIError[], requestAccepts) {
    const response = new Response();

    // Convert errors to an array (if it was singular), and then to APIErrors
    // (if we were given normal Errors).
    response.errors = (Array.isArray(errors) ? errors : [errors])
      .map(<(v: any) => APIError>APIError.fromError.bind(APIError));

    response.status = pickStatus(response.errors.map((v) => Number(v.status)));
    response.body = new Document(response.errors).get(true);

    return negotiateContentType(requestAccepts, ["application/vnd.api+json"])
      .then((contentType) => {
        response.contentType = (contentType.toLowerCase() === "application/json")
          ? contentType : "application/vnd.api+json";
        return response;
      }, () => {
        // if we couldn't find any acceptable content-type,
        // just ignore the accept header, as http allows.
        response.contentType = "application/vnd.api+json";
        return response;
      }
    );
  }

  public static supportedExt = Object.freeze([]);
}

export default APIController;

/**
 * Returns the status code that best represents a set of error statuses.
 */
function pickStatus(errStatuses) {
  return errStatuses[0];
}
