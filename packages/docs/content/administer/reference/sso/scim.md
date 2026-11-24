---
title: SCIM reference
description: "The SCIM 2.0 address, authentication, resources, filters, paging, rate limit and refusals of a provider's provisioning, and what a push may and may not do."
subjects: [scim, sso]
---

A provider's **Provisioning** tab gives an identity provider a SCIM 2.0 address and tokens to push the people and groups it holds. This page is what the address accepts. The steps are in [Provision people with SCIM](../../how-to/sso/provision-people-with-scim).

## Address and authentication

| Part | Value |
| --- | --- |
| Base address | `<public URL>/api/v1/scim/v2/<provider id>`, shown on the **Provisioning** tab |
| Authentication | `Authorization: Bearer <token>`. A token begins `vxp_`, belongs to one provider, and is made on the tab. |
| Refused with 401 | A missing token, one that is not `vxp_`, another provider's, a revoked one, or an expired one: "The token is not valid for this address." |
| Refused with 403 | The provider is paused: "This provider is paused. Save it again in the console before pushing to it." |
| Rate limit | 1,200 requests a minute |
| Content type | `application/scim+json` |

A provider that is off still takes pushes. Only a paused provider does not.

## Resources

| Path | Methods |
| --- | --- |
| `/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas` | `GET` |
| `/Users` | `GET` (list), `POST` |
| `/Users/<id>` | `GET`, `PUT`, `PATCH`, `DELETE` |
| `/Groups` | `GET` (list), `POST` |
| `/Groups/<id>` | `GET`, `PUT`, `PATCH`, `DELETE` |

An instance's provider has no groups to push to.

## Supported

| Feature | Support |
| --- | --- |
| Patch | Yes |
| Filter | Yes. Only `<attribute> eq "<value>"`, with `userName` or `externalId` on users, and `displayName` or `externalId` on groups. Any other filter is refused with 400 and the message "Only these filters are understood: userName eq "…", externalId eq "…"." |
| Paging | `startIndex` and `count`. `count` defaults to 100 and is at most 200. |
| Bulk | No |
| Sort | No |
| Etag | No |
| Change password | No |

## A user

`userName` is required. A user needs an email address: a work email, or a `userName` that is one ("A user needs an email address: a work email, or a userName that is one."). An account is never deleted by a push.

| Push | What happens |
| --- | --- |
| A new user | The account is found by its email or made. For members, the email must be in a domain proved for the provider. For end users, an account that already exists is taken over only when the domain is proved or **Take the provider's word on emails** is on; otherwise it is refused with 409. |
| `active: false`, or `DELETE` | An end user is disabled and what they were signed in to ends. A member of a tenant is suspended in that tenant. For the instance's provider the account is disabled everywhere: sessions end and API keys stop working. |
| `active: true` | Turns on what a provider turned off. An account that a person here turned off by hand stays off. |
| A tie | With **The name the provider signs a person in by is pushed as** set to `externalId` or `userName`, the person is tied to the provider at once, and the value must be the one a sign-in gives as the subject. |

A push for a person who runs the instance, sent by a tenant's provider, is refused with 403: "<email> runs the instance, and a tenant's directory cannot push them. They sign in with a password or the instance's provider." A push that would take the last operator of the instance is refused.

A member's email and name do not follow a push after the account exists; an end user's do. Another user with the same `userName` or `externalId`, or an email held under another `userName`, is refused with 409 and `uniqueness`.

## A group

For a tenant's provider only. A pushed group adopts a group of the tenant only when the provider manages that group. A hand-made group of the same name is refused with 409, and shows in **Refused pushes**. Deleting a pushed group leaves the group here in place. Whether pushed groups decide a person's groups is set by **A person's groups come from**.

## What the tab shows of this

**Refused pushes** lists the pushes the provider sent that were refused, newest first, with the method, the resource, the answer's status and the reason. A `GET` is not listed. They are kept for the period set for **Refused requests** in [Retention](../screens/retention), 7 days by default.
