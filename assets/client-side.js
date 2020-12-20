window.onload = function yeahyeah() {
    var tabs=document.getElementsByClassName("tab");

    Array.prototype.forEach.call(tabs, function(tab) {
        tab.onclick=tabClicked;
    });

}

function tabClicked(e) {
    var tab=e.srcElement;
    var page=document.getElementById(e.srcElement.id.replace("tab", "page"));

    document.getElementsByClassName("tab selected")[0].classList.remove("selected");
    tab.classList.add("selected");

    document.getElementsByClassName("page selected")[0].classList.remove("selected");
    page.classList.add("selected");
}
