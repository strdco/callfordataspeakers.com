
const form=document.querySelector('form#subscribe-form');
const submit=form.querySelector('input[type="submit"]');

form.addEventListener("submit", async (e) => {

        e.preventDefault();      // Prevents the form from submitting
        e.stopPropagation();     // Avoids bubbling to form submit handlers

        var ok=true;

        // Any required field not filled out?
        for (input of Array.from(form.querySelectorAll("input[required]"))) {
            if (input.value.trim()==="") {
                ok=false;
                break;
            }
            if (input.type==="email" && input.value.indexOf("@")===-1) {
                ok=false;
                break;
            }
        }

        // Multiple-option checkbox groups where we have to select at least one member?
        if (form.querySelectorAll("input[type='checkbox'].required").length>0) {
            // If none of them are checked, fail the validation.
            if (form.querySelectorAll("input[type='checkbox'].required:checked").length===0) {
                ok=false;
            }
        }

        if (!ok) { return; }

        submit.disabled=true;
        submit.classList.add("submitted");

        // Post the form
        const formValues = Object.fromEntries(new FormData(form).entries());

        try {
            const res = await fetch(form.target, {
                method: "POST",
                body: JSON.stringify(formValues)
            }).then(response => response.json() );

            form.querySelector("#responses #error-response").style.display="hidden";
            form.querySelector("#responses #success-response").style.display="inline";
        } catch(err) {
            form.querySelector("#responses #error-response").style.display="inline";
            form.querySelector("#responses #success-response").style.display="hidden";
            console.log(err);

            submit.disabled=false;
            submit.classList.remove("submitted");
        }

    });

