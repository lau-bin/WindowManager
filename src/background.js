/*
* Copyrigth: All Rights Reserved
* 
*
*
*  //TODO when there is a store request of an objec thats is waiting to be stored, modify that object and store it later, create queue using sync function  
*
*  //TODO add refresh functionality to execute "init" and dump current state
*   //TODO sidebar items have same order always
*
*   //TODO set save previous session when app is installed and inform the user *unable to do that with the api
/*
Called when the item has been created, or when creation failed due to an error.
We'll just log success/failure here.
*/

const CURRENT_VERSION = "2.0.0"
var initialized = false;

function onCreated() {
  if (browser.runtime.lastError) {
    console.log(`Error: ${browser.runtime.lastError}`);
  } else {
    console.log("Item created successfully");
  }
}

/*
Called when the item has been removed.
We'll just log success here.
*/
function onRemoved() {
  console.log("Item removed successfully");
}

/*
Called when there was an error.
We'll just log the error here.
*/
function onError(error) {
  console.log(`Error: ${error}`);
}
/*
**********************
* Start of the logic *
**********************
*/

Object.defineProperty(this, "StatusCodes", {
  value: {
    normal: 0,
    saveLost: 1,
    windowCLosed: 2,
    newWindow: 3,
    genericWindow: 4,
    newTab: 5
  },
  writable: false
})

Object.defineProperty(this, "SWType", {
  value: {
    window: 0,
    tab: 1
  },
  writable: false
})

var windowMap = new Map() //Map
var generalWindowMap = new Map()//Map of closed windows
var idList = [] //save all ids to find available when needed
var callBackList = [] //Callbacks from sidebars requesting data
var windowToRestore = null

var tabEventMap = new Map()
var windowEventMap = new Map()
var windowTitleEventMap = new Map()
var contentEventMap = []
var windowDeletedEventMap = new Map()

var tabUpdateInfo = new Map()
var index = 0;


//Events
var WM_sidebarNameChange = createEvent("WM_sidebarNameChange")
var WM_tabRemoved = createEvent("WM_tabRemoved")
var WM_tabAdded = createEvent("WM_tabAdded")
var WM_tabUpdated = createEvent("WM_tabUpdated")
var WM_tabColorUpdated = createEvent("WM_tabColorUpdated")
var WM_windowAdded = createEvent("WM_windowAdded")
var WM_windowUpdated = createEvent("WM_windowUpdated")
var WM_windowDeleted = createEvent("WM_windowDeleted")
var WM_tabMoved = createEvent("WM_tabMoved")

const dateFormat = Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
})

function SavedWindow(name, window, id, status, index) {
  this.name = name ? name : dateFormat.format(new Date())
  this.id = id
  this.window = window
  this.status = status ? status : 0
  this.SWType = SWType.window //Reserved for storage keyword
  this.index = index;
}

function TabState(url, favicon, title) {
  this.url = url
  this.favicon = favicon
  this.title = title
}


function storeWindow(savedWindow) {
  if (!savedWindow.window.incognito){
    let savedWindowCopy = Object.assign({}, savedWindow)
    savedWindowCopy.window = Object.assign({}, savedWindow.window)
    savedWindowCopy.window.tabs = undefined
    return browser.storage.local.set({ ["w_" + savedWindow.id]: savedWindowCopy })
  }
  else{
    return Promise.reject("Cant save incognito Window")
  }

}

function removeWindow(savedWindowId) {
  return browser.storage.local.remove("w_" + savedWindowId)
}

function removeTab(tabId, savedWindowId){
  return browser.storage.local.remove("t_" + savedWindowId + "_" + tabId)
}

function storeTab(tab, windowId) {
  if (!tab.incognito){
    tab.SWType = SWType.tab
    tab.SWWId = windowId
    return browser.storage.local.set({ ["t_" + windowId + "_" + tab.id]: tab })
  }
  else{
    return Promise.reject("Cant save incognito Window")
  }


}

//Delete tab from list and storage
function deleteTab(tabId, windowTempId) {
  let window = windowMap.get(windowTempId)
  let index = window.window.tabs.findIndex(tab => tab.id === tabId)
  if (index != -1) {
    window.window.tabs.splice(index, 1)

    
    removeTab(tabId, window.id)
      .then(undefined, error => {
        //TODO manage error
        console.log(error)
      });
  }
  else{
    console.log("Error deleting tab")
  }

}


//Add tab from list and storage
function addtab(tab, savedWindowId) {
  let window = windowMap.get(tab.windowId)
  window.window.tabs.push(tab)
  storeTab(tab, savedWindowId)
}

function createEvent(eventName) {
  var event
  if (document.createEvent) {
    event = document.createEvent("HTMLEvents")
    event.initEvent(eventName, false, true)
    event.eventName = eventName
  } else {
    event = document.createEventObject()
    event.eventName = eventName
    event.eventType = eventName
  }

  return event
}

function subscriveToTabEvent(element, tabId, windowId) {
  let windowMap = tabEventMap.get(windowId)
  if (windowMap) {
    let tabMap = windowMap.get(tabId)
    if (tabMap) {
      tabMap.push(element)
    }
    else {
      windowMap.set(tabId, [element])
    }
  }
  else {
    tabEventMap.set(windowId, new Map([[tabId, [element]]]))
  }

}

function subscriveToTabAddedEvent(element, windowId) {
  let windowMap = windowEventMap.get(windowId)
  if (windowMap) {
    windowMap.push(element)
  }
  else {
    windowEventMap.set(windowId, [element])
  }
}

function subscriveToContentEvent(element) {
  contentEventMap.push(element)
}

function subscribeToDeleteWindowEvent(element, savedWindowId){
  let eventMap = windowDeletedEventMap.get(savedWindowId)

  if (eventMap) {
    eventMap.push(element)
  }
  else {
    windowDeletedEventMap.set(savedWindowId, [element])
  }

}

function subscribeToWindowTitleEvent(element, windowId) {
  let windowMap = windowTitleEventMap.get(windowId)
  if (windowMap) {
    windowMap.push(element)
  }
  else {
    windowTitleEventMap.set(windowId, [element])
  }
}

function fireEvent(element, event) {

  if (document.createEvent) {
    element.dispatchEvent(event);
  }
  else {
    element.fireEvent("on" + event.eventType, event);
  }
}

function tabClosedProcedure(tabId, windowId, savedWindowId){
  deleteTab(tabId, windowId)
  removeTabFromDom(savedWindowId, tabId)
}

function removeTabFromDom(savedWindowId, tabId){
  let elementArray = tabEventMap.get(savedWindowId).get(tabId)
  let length = elementArray.length;
  for (let i = 0; i < length; i++) {
    if (isObjDead(elementArray[i])) {
      elementArray.splice(i, 1)
      length--
      i--
    }
    else {
      fireEvent(elementArray[i], WM_tabRemoved)
    }
  }
  for (let i = 0; i < length; i++) {
    elementArray.shift()
  }
}



function setEventHandlers() {

  //Tab closed
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!removeInfo.isWindowClosing) {
      
      tabClosedProcedure(tabId, removeInfo.windowId, windowMap.get(removeInfo.windowId).id)
    }
  })

  //Tab created
  browser.tabs.onCreated.addListener((tab) => {

    //console.log("tab created")
    tab.WM_status = StatusCodes.newTab
    let existentSavedWindow = windowMap.get(tab.windowId)
    tabUpdateInfo.set(tab.id, new TabState(tab.url, tab.favIconUrl, tab.title))
    if (existentSavedWindow) {
      if (existentSavedWindow.status == 4){
        addtab(tab, existentSavedWindow.id)
      }
      else{
        addtab(tab, existentSavedWindow.id)
        createTabDom(tab, WM_tabAdded, existentSavedWindow)
      }
    }
    else{
      //I could delete the window dom instead of updating it to dont use the old id
      let id
      if (windowToRestore){
        id = windowToRestore.id
        createGenericWindow(tab.windowId, windowToRestore.id)
      }
      else{
        id = createGenericWindow(tab.windowId)
      }
      addtab(tab, id)
    }
  })

  //Tab updated, only propagate when url or favicon changes
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    //console.log("tab updated " + tab.windowId)
    //may add check if it has a window id, if not return
    let tabInfo = tabUpdateInfo.get(tab.id)
    let window

    if (!tabInfo) {
      tabUpdateInfo.set(tab.id, new TabState(tab.url, tab.favIconUrl, tab.title))
      return
    }
    else if (tab.url === tabInfo.url && tab.favIconUrl === tabInfo.favIconUrl && tab.title === tabInfo.title) {
      return
    }
    else {
      tabInfo.url = tab.url
      tabInfo.favIconUrl = tab.favIconUrl
      tabInfo.title = tab.title
    }
    window = windowMap.get(tab.windowId)
    if (window /*&& window.status != 4*/){
      deleteTab(tabId, tab.windowId)
      addtab(tab, window.id)
  
      let elementArray = tabEventMap.get(window.id).get(tabId)
      WM_tabUpdated.WM_tab = tab
      let length = elementArray.length;
      for (let i = 0; i < length; i++) {
        if (isObjDead(elementArray[i])) {
          elementArray.splice(i, 1)
          length--
          i--
        }
        else {
          fireEvent(elementArray[i], WM_tabUpdated)
        }
      }
    }
  })
  //Tab moved to another window or creating a new window
  browser.tabs.onAttached.addListener((tabId, attachInfo) => {

    let hostSavedWindow = windowMap.get(attachInfo.newWindowId)
    if (hostSavedWindow) {
      let tab = browser.tabs.get(tabId).then((tab) => {
        addtab(tab, hostSavedWindow.id)
        let elementArray = windowEventMap.get(hostSavedWindow.id)
        WM_tabAdded.WM_tab = tab
        let length = elementArray.length;
        for (let i = 0; i < length; i++) {
          if (isObjDead(elementArray[i])) {
            elementArray.splice(i, 1)
            length--
            i--
          }
          else {
            fireEvent(elementArray[i], WM_tabAdded)
          }
        }
      }, error => {
        //TODO log error
        console.log(error)
      })
    }
  })
    //Tab moved in window
    browser.tabs.onMoved.addListener((tabId, moveInfo) => {
      let savedWindow = windowMap.get(moveInfo.windowId)
      let tab = savedWindow.window.tabs.find(tab => tab.id === tabId)
      storeTab(tab, savedWindow.id)
  
      let elementArray = tabEventMap.get(window.id).get(tabId)
      WM_tabMoved.WM_tab = tab
      let length = elementArray.length;
      for (let i = 0; i < length; i++) {
        if (isObjDead(elementArray[i])) {
          elementArray.splice(i, 1)
          length--
          i--
        }
        else {
          fireEvent(elementArray[i], WM_tabMoved)
        }
      }
    })
  //Tab detached
  browser.tabs.onDetached.addListener((tabId, detachInfo) => {
    if (!detachInfo.isWindowClosing) {
      deleteTab(tabId, detachInfo.windowId)
      let elementArray = tabEventMap.get(windowMap.get(detachInfo.windowId).id).get(tabId)
      let length = elementArray.length;
      for (let i = 0; i < length; i++) {
        if (isObjDead(elementArray[i])) {
          elementArray.splice(i, 1)
          length--
          i--
        }
        else {
          fireEvent(elementArray[i], WM_tabRemoved)
        }
      }
      for (let i = 0; i < length; i++) {
        elementArray.shift()
      }
    }
  })

  //Window created 
  browser.windows.onCreated.addListener((window) => {
    //console.log("window created")
    let existentWindow = windowMap.get(window.id)
    if (existentWindow){

      if (windowToRestore == null) {

        //Add existent tabs to new window
        window.tabs = existentWindow.window.tabs
        existentWindow.window = window
        existentWindow.status = StatusCodes.normal
        existentWindow.index = index++;

        setWindowValue(window.id, existentWindow.id).then(() => {
          storeWindow(existentWindow).then(undefined, error =>{
            console.log(error)
          })

          //Create Window and Tabs doms
          WM_windowAdded.WM_window = existentWindow
          let length = contentEventMap.length;
          for (let i = 0; i < length; i++) {
            if (isObjDead(contentEventMap[i])) {
              contentEventMap.splice(i, 1)
              length--
              i--
            }
            else {
              fireEvent(contentEventMap[i], WM_windowAdded)
            }
          }
        }, (error) => {
          //TODO Mark error on window and log (error ading id to window)
          console.log(error)
        })
      }
      else{
        //Occurs when restoring a window
        //Window already created, dom must exists, update it and fire event to set it as normal
        for (let i = 0; i < windowToRestore.window.tabs.length; i++){

          removeTab(windowToRestore.window.tabs[i].id, windowToRestore.id)
            .then(undefined, error => {
              //TODO manage error
              console.log(error)
            });
          removeTabFromDom(windowToRestore.id, windowToRestore.window.tabs[i].id)
        }

        //Update generic savedWindow with real data, id of genric window is correct
        existentWindow.status = StatusCodes.normal
        existentWindow.name = windowToRestore.name
        existentWindow.index = windowToRestore.index

        setWindowValue(existentWindow.window.id, existentWindow.id).then(removeWindow(existentWindow.id).then(storeWindow(existentWindow), error =>{
          //TODO log it
          console.log(error)
        }), (error) => {
          //TODO Mark error on window and log (error ading id to window)
          console.log(error)
        })
        //Delete old window entry on the state
        generalWindowMap.delete(windowToRestore.id)
        setDomWindowTitleColor(existentWindow.id, "white", false, existentWindow.window.id)

        //TODO could update each tab instead of deleting old and creating then new ones
        //Add the new tabs
        for (let tab of existentWindow.window.tabs){
          createTabDom(tab, WM_tabAdded, existentWindow)
        }

        //Set it back to null
        windowToRestore = null
      }

    }
    else {
      //TODO this could never be called
      console.log("Error, window created but was not added to windowList")
    }
  })
  
  //Window closed 
  browser.windows.onRemoved.addListener((windowId) => {

    let savedWindow = windowMap.get(windowId)

    if (savedWindow.window.incognito){
      closeWindow(windowId)
    }else{
      savedWindow.status = StatusCodes.windowCLosed
      //Update it in storage
      generalWindowMap.set(savedWindow.id, savedWindow)
      windowMap.delete(windowId)
      removeWindow(savedWindow.id).then(storeWindow(savedWindow), error =>{
        //TODO log it
        console.log(error)
      })
      
      setDomWindowTitleColor(savedWindow.id, "#b3b3b3", true, savedWindow.id)
      
      for (let tab of savedWindow.window.tabs){
        setDomTabTitleColor(savedWindow.id, tab.id, "#b3b3b3")
  
      }
    }
    
  })
  
}

function closeWindow(windowTempId){
  let savedWindow = generalWindowMap.get(windowTempId)
  //Update it in storage
  removeWindow(savedWindow.id).then(undefined, error =>{
    //TODO log it
    console.log(error)
  })
  for (let tab in savedWindow.window.tabs){
    removeTab(tab.id, savedWindow.id)
    .then(undefined, error => {
      //TODO manage error
      console.log(error)
    });
  }
  generalWindowMap.delete(windowTempId)

  let elementArray = windowDeletedEventMap.get(savedWindow.id)
  let length = elementArray.length;

  for (let i = 0; i < length; i++) {
    if (isObjDead(elementArray[i])) {
      elementArray.splice(i, 1)
      length--
      i--
    }
    else {
      fireEvent(elementArray[i], WM_windowDeleted)
    }
  }
}

function restoreWindow(windowId){
  let savedWindow = generalWindowMap.get(windowId)
  windowToRestore = savedWindow
  let urls = savedWindow.window.tabs.sort((a,b)=>(a.index - b.index)).map(element =>{
    if (!element.url.startsWith("about"))
      return element.url
    else return null
  }).filter(element => element)

  browser.windows.create({
    allowScriptsToClose:true,
    url: urls
  }).then(undefined, error =>{
    //TODO log it
    console.log(error)
  })

}

function setDomTabTitleColor(savedWindowId, tabId, color){
  let elementArray = tabEventMap.get(savedWindowId).get(tabId)
  WM_tabColorUpdated.WM_color = color
  let length = elementArray.length;
  for (let i = 0; i < length; i++) {
    if (isObjDead(elementArray[i])) {
      elementArray.splice(i, 1)
      length--
      i--
    }
    else {
      fireEvent(elementArray[i], WM_tabColorUpdated)
    }
  }
}

function setDomWindowTitleColor(savedWindowId, color, closed, windowId){

  let elementArray = windowTitleEventMap.get(savedWindowId)
  let length = elementArray.length;
  WM_windowUpdated.WM_color = color
  WM_windowUpdated.WM_closed = closed
  WM_windowUpdated.WM_windowId = windowId
  for (let i = 0; i < length; i++) {
    if (isObjDead(elementArray[i])) {
      elementArray.splice(i, 1)
      length--
      i--
    }
    else {
      fireEvent(elementArray[i], WM_windowUpdated)
    }
  }
}
function createTabDom(tab, event, savedWindow){
  let elementArray = windowEventMap.get(savedWindow.id)
  event.WM_tab = tab
  event.WM_savedWindow = savedWindow
  let length = elementArray.length;
  for (let i = 0; i < length; i++) {
    if (isObjDead(elementArray[i])) {
      elementArray.splice(i, 1)
      length--
      i--
    }
    else {
      fireEvent(elementArray[i], event)
    }
  }
}

function createGenericWindow(id, windowToRestoreId){
let window = {}
  window.tabs = []
  window.id = id
  let persistentId = windowToRestoreId ? windowToRestoreId : createWindowId()
  let savedWindow = new SavedWindow(undefined, window, persistentId, StatusCodes.genericWindow)
  windowMap.set(id, savedWindow)
  return persistentId
}

function setWindowName(name, windowId, closed) {
  let savedWindow; 

  if (closed){
    savedWindow = generalWindowMap.get(windowId)
  }else{
    savedWindow = windowMap.get(windowId)
  }
  removeWindow(savedWindow.id).then(() => {
    savedWindow.name = name
    storeWindow(savedWindow).then(undefined, error => {
      //Todo rollback name change
      console.log(error)
    })
    //Propagate changes
    WM_sidebarNameChange.WM_text = name
    let elementArray = windowTitleEventMap.get(savedWindow.id)
    let length = elementArray.length;
    for (let i = 0; i < length; i++) {
      if (isObjDead(elementArray[i])) {
        elementArray.splice(i, 1)
        length--
        i--
      }
      else {
        fireEvent(elementArray[i], WM_sidebarNameChange)
      }
    }
  }, error => {
    //Todo rollback name change
    console.log(error)
  })

}

function isObjDead(obj) {
  try {
    String(obj);
  }
  catch (e) {
    return true
  }
  return false
}

//Fix the storage when updating versions of the extension
async function fixStorage(){
  let result = await browser.storage.local.get({version:"empty"})
  switch(result.version){
    case CURRENT_VERSION:
      return;
    case "empty":
    //new install or v1.0.0
    let storage = await browser.storage.local.get(null)
    if (storage){
      //v1.0.0
      console.log("v1.0.0")
      let storageArr = Object.entries(storage);
      await storageArr.forEach(async ([key,value])=>{
        if (key.startsWith("w_")){
          value.index = index++;
          await browser.storage.local.set({key,value})
        }
      })
    }
    break;
    default:
      console.log("Error fixing storage")
  }
  await browser.storage.local.set({version:CURRENT_VERSION})
}

async function init() {
  //console.log("init")
  //Move this if i use init to reload since will register handlers again
  //TODO find a way to execute this only on update
  await fixStorage()

  let savedState = await getSavedState()
  let currentWindows = await getCurrentState()
  let updatedState = []
  let newState = []

  //Checks
  let savedWindowFoundIdList = [] //Save all ids of the stored windows that still exists
  let windowsRequestingIdList = []

  //Compare existing windows with saved ones
  for (let i = 0; i < currentWindows.length; i++) {
    await browser.sessions.getWindowValue(currentWindows[i].id, "id").then(windowId => {
      windowId = parseInt(windowId, 10)
      if (windowId) {//Se le agrego una id anteriormente
        idList.push(windowId)
        let savedWindow = findWindowById(windowId, savedState)

        if (savedWindow) {//The save was found
          savedWindowFoundIdList.push(savedWindow.id)
          updatedState.push([new SavedWindow(savedWindow.name, currentWindows[i], windowId, undefined, savedWindow.index), savedWindow])
          setIndexMaxValue(savedWindow.index)
        }
        else {//Save was lost, this shouldnt happen logg it
          newState.push(new SavedWindow(undefined, currentWindows[i], windowId, StatusCodes.saveLost, undefined))
          console.log("Error: Save lost this shouldnt happen")
        }
      }
      else {//Windows doesnt have saved id, first run or error
        windowsRequestingIdList.push(currentWindows[i])
        console.log("Error: Error window doesnt have saved id")
      }
    })
  }

  //Add backup of non survivors to the list
  savedState.forEach((savedState, key) => {
    if (!savedWindowFoundIdList.some(element => savedState.id == element)) {
      //TODO Make separate array for not existing windows
      savedState.window.id = createWindowId()
      generalWindowMap.set(savedState.id, new SavedWindow(savedState.name, savedState.window, savedState.id, StatusCodes.windowCLosed, savedState.index))
      setIndexMaxValue(savedState.index)

    }
  })

  //Add existent windows without id
  for (let i = 0; i < windowsRequestingIdList.length; i++) {
    let id = createWindowId()

    newState.push(new SavedWindow(undefined, windowsRequestingIdList[i], id, StatusCodes.newWindow, undefined))
    setWindowValue(windowsRequestingIdList[i].id, id).then(undefined, (error) => {
      //TODO Mark error on window and log (error ading id to window)
      console.log(error)
    })
  }

  // let closedWindows = JSON.stringify(generalWindowMap, replacer)
  // let openWindows = JSON.stringify(finalState, replacer)
  // download("closedWindows", closedWindows)
  // download("openWindows", openWindows)


  updateSavedState(updatedState)
  saveState(newState)
  distributeState()
  setEventHandlers() //Will have problems if a window is modified while the extension initializes
  initialized = true;
}
//Needed to set an unused index to new windows
function setIndexMaxValue(value){
  if (index <= value){
    index = value + 1;
  }
}

function download(filename, text) {
  var blob = new Blob([text], {type: 'text/plain;charset=utf-8'})

  browser.downloads.download(  {
    url: URL.createObjectURL(blob),
    filename: filename+'.txt',
});
}

function replacer(key, value) {
  if(value instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(value.entries()), // or with spread: value: [...value]
    };
  } else {
    return value;
  }
}

function reviver(key, value) {
  if(typeof value === 'object' && value !== null) {
    if (value.dataType === 'Map') {
      return new Map(value.value);
    }
  }
  return value;
}

function setWindowValue(windowId, id) {
  return browser.sessions.setWindowValue(windowId, "id", String(id))
}

function saveState(state){
  state.forEach(savedWindow=>{
    //Set index after its value is bigger than any other (old) saved window
    savedWindow.index = index++;
    windowMap.set(savedWindow.window.id, savedWindow)

    let tabs = savedWindow.window.tabs
    storeWindow(savedWindow).then(undefined, error => {
      //TODO log error
      console.log(error)
    })
  
    for (let tab of tabs) {
      storeTab(tab, savedWindow.id).then(undefined, error => {
        //TODO log error
        console.log(error)
      })
    }
  })

}

function updateSavedState(state) {
  state.forEach(([currentWindow, savedWindow]) =>{
    windowMap.set(currentWindow.window.id, currentWindow)
    let currentTabs = currentWindow.window.tabs
    let oldTabs = savedWindow.window.tabs
    //Old window gets replaced
    storeWindow(currentWindow).then(undefined, error => {
      //TODO log error
      console.log(error)
    })
    
    for (let tab of currentTabs) {
      storeTab(tab, currentWindow.id).then(undefined, error => {
        //TODO log error
        console.log(error)
      })
    }
    //Delete after saving new tabs so data is not lost on crash altough possibly duplicated
    for (let tab of oldTabs){
      removeTab(tab.id, savedWindow.id)
      .then(undefined, error => {
        //TODO manage error
        console.log(error)
      });    
    }
  })
}

function createWindowId() {
  while (true) {
    let id = Math.floor(9999 * Math.random())
    if (idList.find(value => value == id) == undefined) {
      idList.push(id)
      return id
    }
  }


}

function findWindowById(id, windows) {
  return windows.get(id)
}


function distributeState() {
  callBackList.forEach(callback => {
    //console.log("executing callback")
    callback([windowMap, generalWindowMap])
  })
}

function getWindowState() {

  if (initialized) {
    return [windowMap, generalWindowMap]
  }
  else {
    return new Promise((resolve, reject) => {
      callBackList.push(resolve)
    })
  }

}


function getSavedState() {
  let savedWindows = new Map()
  let tabsCont = new Map()
  return browser.storage.local.get().then(savedState =>{
    for (let value in savedState) {
      let element = savedState[value]
      if (element.SWType == SWType.window) {
        savedWindows.set(element.id, element)
      }
      else {
        let window = tabsCont.get(element.SWWId)
        if (window) {
          window.push(element)
        }
        else {
          tabsCont.set(element.SWWId, [element])
        }
      }
    }
    savedWindows.forEach((value, key) => {
      value.window.tabs = tabsCont.get(value.id) //Replace any tabs value with real value
    })
    return savedWindows

  }, error => {
    //TODO log it
    console.log(error)
  })
}

function getCurrentState() {
  return browser.windows.getAll({ populate: true, windowTypes: ['normal'] }).then(windowList => {
    // return windowList.map(window=>{
    //   let {id, incognito, tabs} = window
    //   tabs = tabs.map(tab=>{
    //     const {status, url, title, favIconUrl} = tab
    //     return {status, url, title, favIconUrl}
    //   })
    //   return {id, incognito, tabs}
    // })
    return windowList;
  }, (error) => console.log(error))
}

function openSidebar() {
  browser.sidebarAction.setPanel({ panel: browser.runtime.getURL("sidebar/sidebar.html") });
  browser.sidebarAction.toggle()
}

browser.browserAction.onClicked.addListener(()=>{

  openSidebar()
}
  
);
init()
