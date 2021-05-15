/*
*
* Copyrigth: All Rights Reserved
* 
*
*
*/


var backgroundPage = undefined
var contentBox = document.querySelector("#content")

function init(){
    browser.runtime.getBackgroundPage().then(value => {
        backgroundPage = value

        let getWindowState = backgroundPage.getWindowState()

        if (typeof getWindowState.then === 'function'){
            getWindowState.then(windowState => {
                // windows = windowState
                populatePanel(windowState)
            })

        }
        else{
            // windows = getWindowState
            populatePanel(getWindowState)
        }
    })

}

function populatePanel(mapArr){
    backgroundPage.subscriveToContentEvent(contentBox)
    contentBox.addEventListener("WM_windowAdded", function (event){
        contentBox.appendChild(createElement(event.WM_window))

    })

    let savedWindowArr = Array.from(mapArr[0].values())
    savedWindowArr = savedWindowArr.concat(Array.from(mapArr[1].values()))
    savedWindowArr = savedWindowArr.sort((a, b) => a.index - b.index)
    savedWindowArr.forEach(element => {
        contentBox.appendChild(createElement(element))   
    });
    
}

function createElement(value){
    let window = value.window
    let title = createTitle(value.name, value, value.status)
    let tabContainer = document.createElement("DIV")
    tabContainer.className = "tabs"
    let ul = document.createElement("UL")
    window.tabs.forEach(element=>{
        
        ul.appendChild(createTab(element, value))
    });
    title.appendChild(tabContainer)
    tabContainer.appendChild(ul)
    
    backgroundPage.subscriveToTabAddedEvent(ul, value.id)
    ul.addEventListener("WM_tabAdded", (event) =>{
        ul.appendChild(createTab(event.WM_tab, event.WM_savedWindow))
    })
    ul.addEventListener("WM_tabMoved", function (){

    })
    
    return title
}

function createTab(element, savedWindow){
    let li = document.createElement("LI")
    li.WM_tabIndex = element.index
    //Add event handlers
    li.addEventListener("click", function (){
        browser.tabs.get(element.id).then(tab =>{
            browser.tabs.highlight({windowId:savedWindow.window.id,populate:false,tabs:[tab.index]}).then(()=> browser.windows.update(tab.windowId, {focused:true})
            )
        })
    })
    backgroundPage.subscriveToTabEvent(li, element.id, savedWindow.id)
    li.addEventListener("WM_tabRemoved", () =>{
        li.remove()
    })
    li.addEventListener("WM_tabUpdated", (event) =>{
        let WM_tab = event.WM_tab;
        li.innerText = " " + WM_tab.title || WM_tab.url
        li.value = WM_tab.url
        //Sanitizing image
        if (WM_tab.favIconUrl){
            let imageString = WM_tab.favIconUrl.toLowerCase()
            if (validateBase64Image(imageString) && !imageString.includes("script")){
                let image = document.createElement("DIV")
                image.className = "imageDiv"
                image.style.backgroundImage = "url(" + WM_tab.favIconUrl + ")"
                li.prepend(image)
            }
        }

    })
    li.addEventListener("WM_tabColorUpdated", (event) =>{
        li.style.color = event.WM_color
    })
    //Set tab closed color
    if (savedWindow.status == backgroundPage.StatusCodes.windowCLosed){
        li.style.color =  "#b3b3b3" 
    }
    
    li.innerText = " " + element.title || element.url
    li.value = element.url
    //Sanitizing image
    if (element.favIconUrl){
        let imageString = element.favIconUrl.toLowerCase()
        if (validateBase64Image(imageString) && !imageString.includes("script")){
            let image = document.createElement("DIV")
            image.className = "imageDiv"
            image.style.backgroundImage = "url(" + element.favIconUrl + ")"
            li.prepend(image)
        }
    }


    return li
}

function createOpenButton(windowId){
    let button = document.createElement("BUTTON")
    button.id = "title_open_button"
    button.className = "closed"
    button.style.backgroundImage = "url("+browser.runtime.getURL('icons/openButton.png')+")"
    button.WM_windowId = windowId
    button.addEventListener("click", function (event){
        event.preventDefault()
        event.stopPropagation()
        backgroundPage.restoreWindow(event.target.WM_windowId)
    })
    return button
}


function createTitle(name, savedWindow, windowState){
    let elementContainer = document.createElement("DIV")
    backgroundPage.subscribeToDeleteWindowEvent(elementContainer, savedWindow.id)
    elementContainer.addEventListener("WM_windowDeleted", function (event) {
        elementContainer.remove()
    })
    let titleContainer = document.createElement("DIV")
    titleContainer.WM_windowId = savedWindow.window.id
    titleContainer.WM_savedWindowId = savedWindow.id
    let title = document.createElement("LABEL")
    elementContainer.addEventListener("contextmenu", function (event){
        event.preventDefault()
    })
    titleContainer.WM_menuOpen = false
    titleContainer.WM_windowState = windowState
    titleContainer.addEventListener("mousedown", function (event) {

        if (titleContainer.WM_menuOpen == false){
            let isRightClick;
    
            if ("which" in event)  // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
            isRightClick = event.which == 3; 
            else if ("button" in event)  // IE, Opera 
            isRightClick = event.button == 2; 
        
            if (isRightClick) {
                titleContainer.WM_menuOpen = true
                event.preventDefault()
                let menu = document.createElement("UL")
                menu.style.top = String(event.clientY)+"px"
                menu.style.left = String(event.clientX)+"px"
                menu.style.position = "absolute"
                menu.style.zIndex = "1000"
                menu.className = "menu"
                menu.onCLick = function (event) {
                    event.preventDefault()
                    event.stopPropagation()
                }
                
                let dummyFocus = document.createElement("INPUT")
                dummyFocus.style.top = "-9999999px"
                dummyFocus.style.left = "-9999999px"
                dummyFocus.style.position = "absolute"
                dummyFocus.addEventListener("blur", function (event){
                    setTimeout(function (){
                        menu.remove()
                        dummyFocus.remove()
                        titleContainer.WM_menuOpen = false
                    }, 1000)

                }) 
                if (titleContainer.WM_windowState == backgroundPage.StatusCodes.windowCLosed){
                    let option1 = document.createElement("LI")
                    option1.innerText = "Close"
                    option1.className = "menuOption"
                    option1.onclick = function (event) {
                        event.stopPropagation()
        
                        event.target.parentElement.remove()
                        event.target.remove()
                        backgroundPage.closeWindow(titleContainer.WM_savedWindowId)
                    }
                    menu.appendChild(option1)

                }
                event.currentTarget.appendChild(menu)
                event.currentTarget.appendChild(dummyFocus)
                dummyFocus.focus()
            }
        }
        
    })
    titleContainer.appendChild(title)
    //Set window closed color
    if (windowState == backgroundPage.StatusCodes.windowCLosed){
        title.style.color =  "#b3b3b3" 

        //Create button to open window
        let button = createOpenButton(savedWindow.id)
        titleContainer.appendChild(button)
    }

    titleContainer.className = "title_container"
    backgroundPage.subscribeToWindowTitleEvent(titleContainer, savedWindow.id)
    titleContainer.addEventListener("WM_windowUpdated", function (event){
        if (event.WM_closed == true){
            titleContainer.WM_windowState = backgroundPage.StatusCodes.windowCLosed
            
            let button = createOpenButton(event.WM_windowId)
            titleContainer.appendChild(button)
        }
        else if (event.WM_closed == false){
            titleContainer.WM_windowState = undefined
            titleContainer.WM_windowId = event.WM_windowId

            let childNodes = titleContainer.childNodes
            for (let i = 0; i< childNodes.length; i++){
                if (childNodes[i].id === "title_open_button"){
                    childNodes[i].remove()
                    break
                }
            }            
        }
    })

    let image = document.createElement("DIV")
    image.style.backgroundImage = "url(" + browser.runtime.getURL("icons/archived.png") + ")"
    image.name = "TC"
    image.className = "imageDiv"
    image.style.marginRight = "0.5em"
    elementContainer.appendChild(image)
    elementContainer.appendChild(titleContainer)
    elementContainer.saveTabs_closed = true;
    elementContainer.id = "arrow"
    elementContainer.className = "closed"
    elementContainer.name = "TC"
    title.innerText = name
    backgroundPage.subscribeToWindowTitleEvent(title, savedWindow.id)
    title.addEventListener("WM_sidebarNameChange", function (event){
        title.innerText = event.WM_text
    })
    title.addEventListener("WM_windowUpdated", function (event){
        if (event.WM_color != null){
            title.style.color =  event.WM_color

        }
    })
    title.setAttribute("placeholder", ".........")
    elementContainer.addEventListener("click", function (event){

        if (event.target.name === "TC"){
            if (event.currentTarget.saveTabs_closed){
                event.currentTarget.className = "open"
                event.currentTarget.saveTabs_closed = false;
            }
            else{
                event.currentTarget.className = "closed"
                event.currentTarget.saveTabs_closed = true;
            }
        }

    })
    title.addEventListener("click", function (event){
        let input = document.createElement("INPUT")
        let dimensions = event.target.getBoundingClientRect()
        input.style.width = "100vw"
        input.style.top = String(dimensions.top)+"px"
        input.style.left = String(dimensions.left)+"px"
        input.style.position = "absolute"
        input.style.zIndex = "1000"

        input.addEventListener("blur", function (event){
            let name = event.target.value
            if (name && name.length){
                let formattedName = name.charAt(0).toUpperCase() + name.slice(1)
                if (titleContainer.WM_windowState == backgroundPage.StatusCodes.windowCLosed){
                    backgroundPage.setWindowName(formattedName, savedWindow.id, true)
                }else{
                    backgroundPage.setWindowName(formattedName, savedWindow.window.id, false)
                }
                event.target.parentElement.innerText = formattedName
                event.target.parentElement.blur()
            }
            event.target.remove()

        })
        input.addEventListener("keydown", (event) => {
            if (event.keyCode === 13){
                input.blur()
            }
        })
        event.target.appendChild(input)
        input.focus()
        
    })

    return elementContainer;
}

function validateBase64Image(image){
    if (image.substring(0, 11) === "data:image/"){
        let pos1 = image.indexOf(";")
        if (image.substring(pos1 + 1, pos1+7) === "base64"){
            let imgData = image.substring(pos1+8)
            for (let i = 0; i < imgData.length; i++){
                let charCode = imgData.charCodeAt(i) 
                if ((charCode >= 47 && charCode <=57) || (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || charCode == 43 || charCode == 61){
                    continue
                }
                else{
                    return false
                }
            }
            return true
        }
        else{
            return false
        }
    }
    else{
        return false
    }
    
}

init()

