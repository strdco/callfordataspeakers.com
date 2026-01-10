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

## Email backend

The service uses Sender.net to run the actual mailing list.

Users are assigned to "Groups", one for each region they subscribe to. There's also
a group called "Procrastinators" and one called "Moderators". Members of the "Moderators"
group will receive event requests to moderate.

Email templates are stored as local HTML template files in the /assets folder, rather
than on the server (which was the case for Mailchimp), which means that campaigns are
sent as complete HTML documents, rather than just specifying a template and values for
that template.

All actions are performed using the API: subscribing, modifying subscriptions,
and sending campaigns (including sending out event requests for moderation). There
is no longer an embedded signup form.

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
