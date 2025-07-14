// Popular colleges - prioritizing NY schools but keeping national favorites
const popularSchools = [
    // Major New York Universities
    { name: "University at Buffalo (SUNY)", id: "U2Nob29sLTk2MA==" },
    { name: "Stony Brook University (SUNY)", id: "U2Nob29sLTEyMzE=" },
    { name: "University at Albany (SUNY)", id: "U2Nob29sLTEyNDc=" },
    { name: "Binghamton University (SUNY)", id: "U2Nob29sLTk1OA==" },
    { name: "Cornell University", id: "U2Nob29sLTI1Mw==" },
    { name: "Columbia University", id: "U2Nob29sLTIyNA==" },
    { name: "New York University", id: "U2Nob29sLTY3NQ==" },
    { name: "Rochester Institute of Technology", id: "U2Nob29sLTEwMjk=" },
    { name: "University of Rochester", id: "U2Nob29sLTEyNTY=" },
    { name: "Syracuse University", id: "U2Nob29sLTEyMzc=" },
    { name: "Fordham University", id: "U2Nob29sLTM0MQ==" },
    { name: "St. John's University", id: "U2Nob29sLTEwODY=" },
    { name: "Hofstra University", id: "U2Nob29sLTQ2Mw==" },
    { name: "Pace University", id: "U2Nob29sLTk0OA==" },

    // More SUNY Schools
    { name: "SUNY Cortland", id: "U2Nob29sLTI1NQ==" },
    { name: "SUNY Geneseo", id: "U2Nob29sLTM2OA==" },
    { name: "SUNY New Paltz", id: "U2Nob29sLTY4MA==" },
    { name: "SUNY Oswego", id: "U2Nob29sLTkzNg==" },
    { name: "SUNY Plattsburgh", id: "U2Nob29sLTEwMDM=" },
    { name: "SUNY Oneonta", id: "U2Nob29sLTkxOA==" },
    { name: "SUNY Brockport", id: "U2Nob29sLTE0OA==" },
    { name: "SUNY Purchase", id: "U2Nob29sLTEwMTk=" },
    { name: "SUNY Fredonia", id: "U2Nob29sLTM0NQ==" },
    { name: "SUNY Potsdam", id: "U2Nob29sLTEwMDY=" },

    // Community Colleges & Other NY Schools
    { name: "Monroe Community College", id: "U2Nob29sLTYzOA==" },
    { name: "Nassau Community College", id: "U2Nob29sLTY1OQ==" },
    { name: "Westchester Community College", id: "U2Nob29sLTE0ODQ=" },
    { name: "Ithaca College", id: "U2Nob29sLTUwMw==" },
    { name: "Skidmore College", id: "U2Nob29sLTExNDk=" },
    { name: "Colgate University", id: "U2Nob29sLTIyMw==" },
    { name: "Vassar College", id: "U2Nob29sLTE0MDQ=" },
    { name: "Rensselaer Polytechnic Institute", id: "U2Nob29sLTEwMjU=" },
    { name: "Clarkson University", id: "U2Nob29sLTIwNw==" },
    { name: "The New School", id: "U2Nob29sLTE0NzI=" },

    // Popular National Universities (keeping original favorites)
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

// Get references to the popup elements
let toggle = document.getElementById('powerToggle');
let schoolSelect = document.getElementById('schoolSelect');
let saveStatus = document.getElementById('saveStatus');

function loadSettings() {
    // Load saved settings from Chrome storage
    chrome.storage.sync.get(['enabled', 'schoolId', 'schoolName'], (data) => {
        if (data.enabled) {
            toggle.classList.add('on');
        }

        populateSchoolDropdown(data.schoolId);
    });
}

function populateSchoolDropdown(savedSchoolId) {
    // Clear existing options and add the default
    schoolSelect.innerHTML = '<option value="">Choose your school...</option>';

    // Add all the schools to the dropdown
    popularSchools.forEach(school => {
        let option = document.createElement('option');
        option.value = school.id;
        option.textContent = school.name;

        // Select the previously saved school
        if (school.id === savedSchoolId) {
            option.selected = true;
        }

        schoolSelect.appendChild(option);
    });

    // Add an option for schools not in our list
    let otherOption = document.createElement('option');
    otherOption.value = "other";
    otherOption.textContent = "My school isn't listed (Search manually on RMP)";
    schoolSelect.appendChild(otherOption);
}

function saveSettings() {
    // Get current settings from the UI
    let enabled = toggle.classList.contains('on');
    let selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
    let schoolId = selectedOption.value;
    let schoolName = selectedOption.textContent;

    // Save to Chrome storage
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
    // Show a brief "saved" message to the user
    saveStatus.classList.add('show');
    setTimeout(() => {
        saveStatus.classList.remove('show');
    }, 2000);
}

function notifyContentScript() {
    // Tell the content script about the new settings
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'settingsUpdated',
                enabled: toggle.classList.contains('on'),
                schoolId: schoolSelect.value,
                schoolName: schoolSelect.options[schoolSelect.selectedIndex].textContent
            });
        }
    });
}

// Event listeners for user interactions
toggle.addEventListener('click', function() {
    this.classList.toggle('on');
    saveSettings();
});

schoolSelect.addEventListener('change', saveSettings);

// Load settings when popup opens
loadSettings();