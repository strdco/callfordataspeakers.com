# callfordataspeakers.com

## The problem we're trying to solve

Until the demise of PASS, whenever a new SQL Saturday conference was announced, a
Call for Speakers email would go out to all subscribed former SQL Saturday speakers
in that region. This was a great help to organizers to help reach out to speakers for
session abstracts.

The data platform community is rapidly building new solutions to replace the PASS
infrastructure, but there is no central repository for conference speakers.

This solution aims to a) provide a place for speakers to register, including indicating
which region(s) they're available to speak in, and b) create a solution for conference
organizers to send a one-time Call for Speakers mailing to those speakers.

## Front-end web

The frontend is built on Node.js, hosted as an Azure WebApp behind a Cloudflare CDN.

## Mailchimp

The mailing list is stored in Mailchimp, in a single list ("list"). There's a "Region"
group, where speakers belong to zero or more groups, indicating region(s) where they
would be available to speak.

Moderators are in a list called "Organizers" and are members of an "Organizer" group. Even
though, at the time of writing, moderation emails have only a single recipient, we're
still using the Mailchimp "Marketing" API, rather than the "Transactional" API (which in
practice is the Mandrill app) because they're essentially two different products, with
two different Node APIs, subscriptions, and pricing.

Mail templates are manually coded to allow for `mc:edit` tags inline with the message.

Recipients are asked to double opt-in, and they get a welcome message upon signing up.
All those features are handled in the Mailchimp GUI.

### Mailchimp embedded forms

Subscribing as a speaker is done in an embedded Mailchimp subscription form. This allows
us to use Mailchimp's validation logic, and if we want to add or change any field in the
future, we can copy-paste the new embed code directly into the registration page.

Event requests do not pass through Mailchimp as such, but we've designed the forms to use
the same elements and CSS classes, so we can still use the Mailchimp validation logic
before the form is posted.

## Database

A tiny database backend keeps track of requested conference emails. The database scripts
have been included in the "database" folder.

All database objects reside in the `CallForDataSpeakers` schema, and the service account
is set up with `SELECT` and `EXECUTE` permissions on the schema.

The only secret stored in the database is the "token", which is a GUID that identifies each
row. This GUID is only needed once, in the moderation process, to authorize sending of a
campaign.

## Updating the subscriber count

A scheduled job (Azure Runbook, but could be anything, really) occasionally calls
`/api/sync-mailchimp`, which refreshes the subscriber count per region from Mailchimp.
I didn't want to do this in real-time to avoid hitting any rate limit on Mailchimp.

The subscriber count is stored in the local file `/assets/subscriber-count.json`

## Security

I've tried to follow security best practices by design; minimizing dependencies and the
use of secrets, avoiding any account management logic, and following the recommendations
needed for an A+ score on [securityheaders.com](https://securityheaders.com/).

Security contact information is available at the universally accepted URL `/security.txt`

## Pull requests welcome.

I am not what you would call a web developer, so any help would be appreciated if you
see anything that needs fixing.

## Mastodon

This project has a Mastodon account. You can follow:
<a rel="me" href="https://dataplatform.social/@callforspeakers">callforspeakers on dataplatform.social</a>.
