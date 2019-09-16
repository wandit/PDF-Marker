import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'pdf-marker-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss']
})
export class MenuComponent implements OnInit {
  readonly settings: string = "Settings";

  constructor() { }

  ngOnInit() {
  }

  readonly toolbarMenu = [
    { title: "Import", toolTip: "Import Zip from default LMS", icon: "archive" },
    { title: "Upload", toolTip: "Upload PDF file(s)", icon: "insert_drive_file" },
    { title: this.settings, toolTip: "App Settings", icon: "settings" },
  ];

  readonly menuItems = [
    { title: "LMS Selection", icon: "dns" },
    { title: "Default Zip Location", icon: "folder_open" }
  ]
}