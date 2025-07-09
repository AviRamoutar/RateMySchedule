const popularSchools = [
    { name: "University at Buffalo", id: "U2Nob29sLTk2MA==" },
    { name: "New York University", id: "U2Nob29sLTY3NQ==" },
    { name: "University of California Los Angeles", id: "U2Nob29sLTEwODM=" },
    { name: "University of Texas at Austin", id: "U2Nob29sLTEyNTU=" },
    { name: "Penn State University", id: "U2Nob29sLTk3MQ==" },
    { name: "University of Michigan", id: "U2Nob29sLTExNjQ=" },
    { name: "Ohio State University", id: "U2Nob29sLTkyMQ==" },
    { name: "University of Florida", id: "U2Nob29sLTExMDA=" },
    { name: "Arizona State University", id: "U2Nob29sLTQ1" },
    { name: "University of Wisconsin Madison", id: "U2Nob29sLTExODk=" },
    { name: "Boston University", id: "U2Nob29sLTEyNjY=" },
    { name: "University of Illinois Urbana-Champaign", id: "U2Nob29sLTExMTI=" },
    { name: "Georgia Institute of Technology", id: "U2Nob29sLTM2MQ==" },
    { name: "Northeastern University", id: "U2Nob29sLTY5Ng==" },
    { name: "University of Washington", id: "U2Nob29sLTE1MzA=" }
];

let toggle = document.getElementById('powerToggle');
let schoolSelect = document.getElementById('schoolSelect');
let saveStatus = document.getElementById('saveStatus');

function loadSettings() {
    chrome.storage.sync.get(['enabled', 'schoolId', 'schoolName'], (data) => {
        if (data.enabled) {
            toggle.classList.add('on');
        }

        populateSchoolDropdown(data.schoolId);
    });
}

function populateSchoolDropdown(savedSchoolId) {
    schoolSelect.innerHTML = '<option value="">Select your school...</option>';

    popularSchools.forEach(school => {
        let option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.name;
        if (school.id === savedSchoolId) {
            option.selected = true;
        }
        schoolSelect.appendChild(option);
    });

    let otherOption = document.createElement('option');
    otherOption.value = "other";
    otherOption.textContent = "Other (Search manually on RMP)";
    schoolSelect.appendChild(otherOption);
}

function saveSettings() {
    let enabled = toggle.classList.contains('on');
    let selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
    let schoolId = selectedOption.value;
    let schoolName = selectedOption.textContent;

    chrome.storage.sync.set({
        enabled: enabled,
        schoolId: schoolId,
        schoolName: schoolName
    }, () => {
        showSaveConfirmation();
        notifyContentScript();
    });
}

function showSaveConfirmation() {
    saveStatus.classList.add('show');
    setTimeout(() => {
        saveStatus.classList.remove('show');
    }, 2000);
}

function notifyContentScript() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'settingsUpdated',
            enabled: toggle.classList.contains('on'),
            schoolId: schoolSelect.value,
            schoolName: schoolSelect.options[schoolSelect.selectedIndex].textContent
        });
    });
}

toggle.addEventListener('click', function() {
    this.classList.toggle('on');
    saveSettings();
});

schoolSelect.addEventListener('change', saveSettings);

loadSettings();