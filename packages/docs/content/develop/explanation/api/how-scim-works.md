---
title: How SCIM provisioning works
description: What an identity provider's SCIM calls reach, how it signs in, what each call does here, and what is not supported.
subjects: [api, authentication]
---

An identity provider that speaks SCIM 2.0 can create, change and turn off the people and groups of a tenant without waiting for them to sign in. This page describes the calls the provider makes. How a person sets the provider up is on the [single sign-on screen](../../../administer/reference/screens/single-sign-on), and every route is in the [SCIM part of the API reference](../../reference/api/scim).

## The idea

Volvel is the SCIM service and the identity provider is its client. The provider is given an address and a token, and the console shows both. The address is `/api/v1/scim/v2/<provider id>` on the instance, and it never changes. The token begins `vxp_`, is shown once when it is made, and opens that provider's address and nothing else. A token may have an expiry of 1 to 3,650 days, and may be revoked.

Every call carries `Authorization: Bearer vxp_...`. A token that is wrong, revoked, expired or for another provider is refused with 401 "The token is not valid for this address." A provider that is paused is refused with 403 until it is saved again in the console.

Bodies are `application/scim+json`. Errors are SCIM's: `schemas`, `status`, an optional `scimType` and a `detail`, not the problem bodies the rest of the API gives. A provider is limited to 1,200 calls a minute for each address.

## What the provider reads

| Call | Answers |
| --- | --- |
| `GET …/ServiceProviderConfig` | What this service supports. |
| `GET …/ResourceTypes` | The resource types, `User` and `Group`. |
| `GET …/Schemas` | Their schemas. |

The configuration says: patch is supported; filter is supported with at most 200 results; bulk is not supported; sort is not; change of password is not; `etag` is not. The one authentication scheme is a bearer token.

## What the provider pushes

| Call | What it does here |
| --- | --- |
| `GET …/Users`, `GET …/Users/<id>` | Lists or reads the people it pushed. `filter` takes `userName eq "…"` or `externalId eq "…"` and nothing else. |
| `POST …/Users` | Finds or makes the account. A member's email must be in a domain the provider has proved. A person needs an email: a work email, or a `userName` that is one. With `active` false the person is turned off at once. |
| `PUT …/Users/<id>`, `PATCH …/Users/<id>` | Changes them. `PATCH` takes `add`, `replace` and `remove`, with a path or an object of attributes. `active` set to false turns the person off: an end user is disabled, a member is suspended in the tenant, and for the instance's own provider the account is disabled everywhere. |
| `DELETE …/Users/<id>` | Turns the person off here and removes their tie to the provider. The account and what it owns are kept. |
| `GET …/Groups`, `GET …/Groups/<id>` | Lists or reads pushed groups. `filter` takes `displayName eq "…"` or `externalId eq "…"`. |
| `POST`, `PUT`, `PATCH …/Groups` | Pushes a group. Which group here its people belong to is said by the provider's group map, by the group's name. Where the provider makes groups of its own, one is made. |
| `DELETE …/Groups/<id>` | The group here stays. The people who were in it by the push leave it. |

A list takes `startIndex` (from 1) and `count`, at most 200 and 100 by default.

A name or an external ID that is already used by someone else is refused as a clash. A push that would leave the tenant without an admin, or the instance without an operator, is refused with 409, and it shows under the refused pushes in the console. Nothing a refused push carried is kept: only its reason.

Each change is in the audit log as made by `SCIM: <provider name>`, with the token's first characters.

## What the provider setup decides

Three settings of the provider say how a push is taken:

- **`subjectFrom`** is the pushed field that holds the name the provider signs the person in by: `externalId` or `userName`. With one named, a pushed person is tied to the provider at once. With none, their first sign-in ties them, under the rules for any first sign-in.
- **`groups`** says where a person's groups come from: `sign_in` for what a sign-in says, or `scim` for the groups that are pushed.
- **`createGroups`** makes a group here for a pushed group that nothing maps yet.

## What is not there

Bulk operations, sorting, `etag` and changing a password are not supported, and the configuration says so. There is no SCIM route for anything but users and groups.

## How it fits

- A person with `sso:write` (`instance:write` for the instance's own provider) makes the token and chooses the settings, on the provider's page: [single sign-on](../../../administer/reference/screens/single-sign-on).
- For rate limits, see [How rate limits work](how-rate-limits-work).
