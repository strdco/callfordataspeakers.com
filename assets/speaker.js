

document.querySelector('form#subscribe-form').addEventListener("submit", postFormEvent);

if (document.location.pathname==="/modify") {
    document.querySelector('form#subscribe-form input[type=submit]').value="Update information";
}
