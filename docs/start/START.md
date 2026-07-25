We will be developing an app should work as DnD character sheet. I is gonna be somewhat glorified "Excel". It is meant to be flexible so it can take as many modifications as possible. So no implementations of DnD automatic counters (like saving throws from abilities etc..).

** Data Storage **

The character (or the character sheet) will live as a json file. Each character single file. The file will store data in a versioned explicitly typed model. 

There will be local (now) and remote storage (eventually). Both storage store character data as json file (does not have to be literally a file on filesystem). The local storage is the master of data. Remote storage is a backup place the app may sync on command (either upload of download data; versioned at least with date of upload).

** Layers of the app**

There will be three layers: 1. data access, 2. business, 3. ui.

Eventually there will be layer 0 or separate data access layer for communication with remote storage. At fist this will not be implemented.

The data access layer must take care of adherence to schema validation and migration of data in older version fot the schema.

Business layer will operate on data access layer. It will use data in the newest most schema, the data access layer must take care of migrating in an encapsulated way. Business layer will implemented the active logic of the app itself.  

UI layer will contain ideally React based front-end that will call use the business layer to trigger business logic and to reactively update to the changes in the data.

** Tech stack **
 
The app will be written full stack in TypeScript and React (or similar framework).

When selecting frameworks, we must take into account that the app should be usable from PC and from phone. The web app for both is OK and having two separate builds (web app or desktop app for pc, and mobile app for phone) is OK too. If separate builds are used, the UI, business and data access should be as much portable as possible in order to prevent duplicating logic.

It would be great to use storybook or any other framework to easily develop, review and visualize the UI in different states.

This must contain prettier so the VSCode can format using prettier on autosave reliably.

It is up to you to decide what other to use (linting, unit and other types of testing etc...).

