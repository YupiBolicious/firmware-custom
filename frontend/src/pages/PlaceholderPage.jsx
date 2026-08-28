import { Link } from 'react-router-dom';

export default function PlaceholderPage({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <div className="panel">
        <p className="text-muted">
          {title} is not implemented yet. This page is a placeholder for an upcoming management feature.
        </p>
        <Link className="btn btn-secondary btn-sm" to="/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}