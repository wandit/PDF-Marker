import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from "@angular/router";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
// Shared Components
import {FileExplorerComponent} from './components/file-explorer/file-explorer.component';
import {FileExplorerModalComponent} from './components/file-explorer-modal/file-explorer-modal.component';
import { SideNavigationComponent } from './components/side-navigation/side-navigation.component';
import {AlertComponent} from "./components/alert/alert.component";
// Angular Material Modules
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatDividerModule} from "@angular/material/divider";
import {MatIconModule} from "@angular/material/icon";
import {MatButtonModule} from "@angular/material/button";
import {MatMenuModule} from "@angular/material/menu";
import {MatTooltipModule} from "@angular/material/tooltip";
import {MatListModule} from "@angular/material/list";
import {MatSidenavModule} from "@angular/material/sidenav";
import {MatInputModule} from "@angular/material/input";
import {MatCheckboxModule} from "@angular/material/checkbox";
import {MatSelectModule} from "@angular/material/select";
import {MatExpansionModule} from '@angular/material/expansion';
import {MatDialogModule} from "@angular/material/dialog";
import {MatProgressBarModule} from "@angular/material/progress-bar";
import {HTTP_INTERCEPTORS, HttpClientModule} from "@angular/common/http";
import {PdfMarkerErrorInterceptorService} from "@sharedModule/services/pdf-marker-error-interceptor.service";
import {AssignmentListComponent} from "@sharedModule/components/assignment-list/assignment-list.component";
import {AssignmentService} from "@sharedModule/services/assignment.service";
import { AssignmentMarkingComponent } from './components/assignment-marking/assignment-marking.component';

const SHARED_MODULES = [
  MatToolbarModule,
  MatDividerModule,
  MatIconModule,
  MatButtonModule,
  MatMenuModule,
  MatTooltipModule,
  MatListModule,
  MatSidenavModule,
  MatInputModule,
  MatCheckboxModule,
  MatSelectModule,
  MatExpansionModule,
  MatDialogModule,
  MatProgressBarModule,
  RouterModule,
  FormsModule,
  ReactiveFormsModule,
  HttpClientModule
];

const SHARED_COMPONENTS = [FileExplorerComponent, FileExplorerModalComponent, AlertComponent, SideNavigationComponent];

@NgModule({
  declarations: [FileExplorerComponent, FileExplorerModalComponent, AlertComponent, AssignmentListComponent, SideNavigationComponent, AssignmentMarkingComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatExpansionModule,
    MatListModule,
    MatDividerModule,
    MatToolbarModule
  ],
  providers: [{provide: HTTP_INTERCEPTORS, useClass: PdfMarkerErrorInterceptorService, multi: true}, AssignmentService],
  exports: [ ...SHARED_MODULES, ...SHARED_COMPONENTS ],
  entryComponents: [ FileExplorerModalComponent ]
})
export class SharedModule { }
