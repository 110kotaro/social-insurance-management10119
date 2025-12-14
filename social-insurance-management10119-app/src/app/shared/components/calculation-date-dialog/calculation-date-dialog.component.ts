import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-calculation-date-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>保険料計算</h2>
    <mat-dialog-content>
      <form [formGroup]="dateForm">
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>年</mat-label>
            <mat-select formControlName="year" required>
              <mat-option *ngFor="let y of years" [value]="y">{{ y }}年</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>月</mat-label>
            <mat-select formControlName="month" required>
              <mat-option *ngFor="let m of months" [value]="m">{{ m }}月</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">キャンセル</button>
      <button mat-raised-button color="primary" (click)="confirm()" [disabled]="dateForm.invalid">
        計算実行
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-row {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }
    mat-form-field {
      width: 150px;
    }
    mat-dialog-content {
      min-width: 300px;
    }
  `]
})
export class CalculationDateDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<CalculationDateDialogComponent>);

  dateForm: FormGroup;
  years: number[] = [];
  months: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  constructor() {
    const currentYear = new Date().getFullYear();
    // 過去5年から未来2年まで
    for (let i = currentYear - 5; i <= currentYear + 2; i++) {
      this.years.push(i);
    }

    const currentMonth = new Date().getMonth() + 1;

    this.dateForm = this.fb.group({
      year: [currentYear, Validators.required],
      month: [currentMonth, Validators.required]
    });
  }

  confirm(): void {
    if (this.dateForm.valid) {
      this.dialogRef.close({
        year: this.dateForm.value.year,
        month: this.dateForm.value.month
      });
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

