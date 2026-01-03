
// For fixed-width numeric values, automatically move to the next tabstop when
// the field is completely filled out. If the field is empty, move to the previous
// tabstop if the user presses backspace.
for (input of document.querySelectorAll("input[maxlength][pattern]")) {
    if (input.pattern==="[0-9]*") {

        // Left-pad numeric values with 0
        input.addEventListener("change", (e) => {
            if (e.target.value.length===1 && e.target.size===2) {
                e.target.value="0"+e.target.value;
            }
        });

        input.addEventListener("keyup", (e) => {
            var nextTarget;
            if (e.key.match(/[0-9]/g)) {
                if (e.target.value.length.toString()==e.target.maxLength) {
                    if (e.target.id.match(/\-year/)) { nextTarget=e.target.id.split("-year").join("-month"); }
                    if (e.target.id.match(/\-month/)) { nextTarget=e.target.id.split("-month").join("-day"); }
                }
            } else if (e.key==="Backspace") {
                if (e.target.value.length===0) {
                    if (e.target.id.match(/\-day/)) { nextTarget=e.target.id.split("-day").join("-month"); }
                    if (e.target.id.match(/\-month/)) { nextTarget=e.target.id.split("-month").join("-year"); }
                }
            }
            if (nextTarget) {
                document.querySelector("input#"+nextTarget).focus();
            }
        });
    }
}




// If there's a counter element in the footer of the page, update it with the number of
// sent campaigns and emails

var p_counter=document.querySelector('#counter');
if (p_counter) {
    fetch("/assets/campaign-count.json").then(async response => {
        if (response.status===200) {
            const campaignCount = await response.json();
            p_counter.innerText= 'We\'ve sent '+campaignCount.emails+' call for speaker emails for '+campaignCount.campaigns+' events so far!';
        }
    });
}








// Any change to an input element triggers a form validation:
for (form of document.querySelectorAll("form")) {
    for (input of form.querySelectorAll("input")) {
        input.addEventListener("change", (e) => {
            validateForm(form);
        })
    }
}



// Form validation happens here.
function validateForm(formObject) {
    var valid=true;
    const submit=formObject.querySelector("input[type=submit]");
    const values=formValues(formObject);
    const allInputs = document.querySelectorAll("input");
    var invalidInput;

    for (const input of allInputs) {
        input.classList.remove("invalid");
    }

    for (const input of allInputs) {

        if (input.type==="checkbox" && input.classList.contains("required") && !values[input.name]) {
            invalidInput=input;
            valid=false;
        } else if (input.type==="url" && !/^(http|https):\/\/.{1,}\..{1,}/.test(input.value)) {
            invalidInput=input;
            valid=false;
            break;
        } else if (input.type==="email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
            invalidInput=input;
            valid=false;
            break;
        } else if (input.min && input.value!=="" && parseInt(input.value)<parseInt(input.min)) {
            invalidInput=input;
            valid=false;
            break;
        } else if (input.max && input.value!=="" && parseInt(input.value)>parseInt(input.max)) {
            invalidInput=input;
            valid=false;
            break;
        } else if (input.type!=="checkbox" && input.required && input.value.trim()==="") {
            invalidInput=input;
            valid=false;
            break;
        } else if ( input.placeholder==="YYYY" && input.value!=="" && parseInt(input.value)<(new Date).getFullYear() ) {
            invalidInput=input;
            valid=false;
            break;
        } else if ( input.placeholder==="YYYY" && input.value!=="" && parseInt(input.value)>(new Date).getFullYear()+1 ) {
            invalidInput=input;
            valid=false;
            break;
        } else if ( input.placeholder==="DD" && input.value!=="" && !isValidIsoDate(values[input.name.split("[")[0]]) ) {
            invalidInput=input;
            valid=false;
            break;
        }
    }

    if (invalidInput) {
        invalidInput.classList.add("invalid");
    }

    if (submit) {
        submit.disabled=!valid;
    }
    return invalidInput;
}






function formValues(formObject) {

    const fd = new FormData(formObject);

    // Unique keys from the FormData
    const keys = [...new Set(fd.keys())];

    var values = Object.fromEntries(
        keys.map(k => {
            const all = fd.getAll(k);
            return [k, all.length > 1 ? all : all[0]]; // array if multiple, single value otherwise
        })
    );

    for (entry of Object.entries(values).filter(e => e[0].match(/\[year\]/))) {
        const variable = entry[0].replace("\[year\]", "");
        values[variable]=
            values[variable+"[year]"]+"-"+
            values[variable+"[month]"]+"-"+
            values[variable+"[day]"];
    }

    for (entry of Object.entries(values).filter(e => e[0].match(/\[(year|month|day)\]/))) {
        delete values[entry[0]];
    }

    return values;
}




function isValidIsoDate(dateString) {

    // Test formatting
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
    }

    const [yearString, monthString, dayString] = dateString.split("-");
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    // Test if the number parts look reasonable
    if (year < 2000 || year > 2099) { return false; }
    if (month < 1 || month > 12) { return false; }
    if (day < 1 || day > 31) { return false; }

    // Test if the date makes sense
    const date = new Date(Date.UTC(year, month - 1, day));
    return ( 
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day);
}






// Add this function to the onsubmit event:
async function postFormEvent(e) {

    e.preventDefault();      // Prevents the form from submitting
    e.stopPropagation();     // Avoids bubbling to form submit handlers

    postForm(e.target);
}

// ... or create your own onsubmit event that calls this function directly:
async function postForm(form, submit) {
    const responses = form.querySelector("#responses");
    if (!submit) { submit=form.querySelector("input[type=submit]"); }

    if (submit) {
        submit.disabled=true;
    }

    if (responses) {
        responses.querySelector("#error-response").style.display="hidden";
        responses.querySelector("#success-response").style.display="hidden";
    }

    // Post the form
    try {
        const res = await fetch(form.action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formValues(form))
        }); // .then(response => response.json() );

        if (res.status===200) {
            if (responses) {
                responses.querySelector("#error-response").style.display="hidden";
                responses.querySelector("#success-response").style.display="inline";
            }

            return true;
        } else {
            if (responses) {
                responses.querySelector("#error-response").style.display="inline";
                responses.querySelector("#success-response").style.display="hidden";
            }

            if (submit) {
                submit.disabled=false;
            }

            return false;
        }
    } catch(err) {
        if (responses) {
            responses.querySelector("#error-response").style.display="inline";
            responses.querySelector("#success-response").style.display="hidden";
        }
        console.log(err);

        if (submit) {
            submit.disabled=false;
        }

        return false;
    }
}
