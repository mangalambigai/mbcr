
'use strict';

navigator.serviceWorker.register('/sw.js').then(function (reg) {});

function getSchedule() {

    var depStation = document.getElementById('departure').value;
    var destStation = document.getElementById('arrival').value;
    var maxHours = document.getElementById('maxtime').value;

    document.getElementById('results').innerHTML = '';
    var resCount = document.getElementById('resultCount');
    resCount.innerHTML = '';
    resCount.classList.add('hidden');

    if (depStation && destStation)
        getTripsByStation(depStation, destStation, maxHours);

}

function getTripsByStation(depStation, destStation, maxHours) {

    fetch(
        'http://realtime.mbta.com/developer/api/v2/schedulebystop?api_key=xGeHtAQ3kk2mYyhD4fO8rw&stop=' +
        depStation + '&max_time=' + maxHours*60, {
            method: 'GET' //, mode: 'no-cors'
        }).then(function (response) {
        return response.json();
    }).catch(function (error) {
        console.log(error);
    }).then(function (trips) {

        var tripids=[];
        trips.mode.forEach(function (mode) {
            mode.route.forEach(function (route) {
                route.direction.forEach(function (direction) {
                    direction.trip.forEach(function (trip) {
                        tripids.push(trip.trip_id);
                    });
                });
            });
        });

        Promise.all(tripids.map(getScheduleByTrip))
        .then(function(response){
            displaySchedules(response, depStation, destStation, maxHours);
        })
        .catch(function (error) {
            console.log(error);
        });
    });
}

function getScheduleByTrip(trip) {
    return fetch('http://realtime.mbta.com/developer/api/v2/schedulebytrip?' +
        'api_key=xGeHtAQ3kk2mYyhD4fO8rw&trip=' + trip, {
            method: 'GET'
    }).then(function (response) {
        return response.json();
    });
}

function displaySchedules(schedules, depStation, destStation, maxHours) {
    var tripCount = 0;
    schedules.forEach(function (schedule) {
        if (displaySchedule(schedule, depStation, destStation) == true) {
            tripCount++;
        }
    });

//Display the number of trains with correct pluralization.
    var resCount = document.getElementById('resultCount');
    resCount.innerHTML='There '+ (tripCount > 1?'are ':'is ') +
        tripCount + ' train' + (tripCount > 1?'s ':' ') +'from '
        + depStation + ' to ' + destStation +
        ' in the next '+maxHours + ' hour' + (maxHours > 1?'s.':'.');

    resCount.classList.remove('hidden');
}

function displaySchedule(schedule, depStation, destStation) {
    var frag = document.createDocumentFragment();

    var divMain = document.createElement('div');
    divMain.className = "col-md-4 col-sm-12";
    frag.appendChild(divMain);

    var divPanel = document.createElement('div');
    divPanel.className = ' panel panel-primary';
    divMain.appendChild(divPanel);

    var divPanelHeading = document.createElement('div');
    divPanelHeading.className = 'panel-heading';
    divPanel.appendChild(divPanelHeading);

    var divPanelTitle = document.createElement('div');
    divPanelTitle.className = 'panel-title';
    divPanelTitle.innerHTML = schedule.route_name + ' ' +
        schedule.trip_name +
        ' ' + schedule.direction_name;
    divPanelHeading.appendChild(divPanelTitle);

    var divPanelBody = document.createElement('div');
    divPanelBody.className = 'panel-body';
    divPanel.appendChild(divPanelBody);

    var table = document.createElement('table');
    table.className = 'table table-hover table-striped';
    divPanelBody.appendChild(table);

    var tr = document.createElement('tr');
    table.appendChild(tr);

    var tharr = document.createElement('th');
    tharr.innerHTML = 'Arrival Time';
    tr.appendChild(tharr);

    var thdep = document.createElement('th');
    thdep.innerHTML = 'Departure Time';
    tr.appendChild(thdep);

    var thstop = document.createElement('th');
    thstop.innerHTML = 'Stop Name';
    tr.appendChild(thstop);

    var tbody = document.createElement('tbody');
    table.appendChild(tbody);

    var foundStart = false,
        foundStop = false;

    schedule.stop.forEach(function (stop) {
        if (stop.stop_name === depStation)
            foundStart = true;

        if (foundStart && !foundStop) {

            if (stop.stop_name === destStation)
                foundStop = true;

            var tr = document.createElement('tr');
            tbody.appendChild(tr);

            var tdarr = document.createElement('td');
            var d = new Date(0); // The 0 there is the key, which sets the date to the epoch
            d.setUTCSeconds(stop.sch_arr_dt);
            tdarr.innerHTML = d.toLocaleTimeString();
            tr.appendChild(tdarr);

            var tddep = document.createElement('td');
            var d1 = new Date(0); // The 0 there is the key, which sets the date to the epoch
            d1.setUTCSeconds(stop.sch_dep_dt);
            tddep.innerHTML = d1.toLocaleTimeString();
            tr.appendChild(tddep);

            var tdstop = document.createElement('td');
            tdstop.innerHTML = stop.stop_name;
            tr.appendChild(tdstop);
        }
    });

    if (foundStop)
        document.getElementById('results').appendChild(frag);

    return foundStop;
}